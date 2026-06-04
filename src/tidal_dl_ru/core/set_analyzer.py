import asyncio
import io
import os
import tempfile

from tidal_dl_ru.core.router import get_provider_by_name
from tidal_dl_ru.server import jobs as job_state


def _download_progress_hook(job_id: str):
    last_label = [""]

    def hook(data: dict) -> None:
        status = data.get("status")
        if status == "downloading":
            total = data.get("total_bytes") or data.get("total_bytes_estimate") or 0
            downloaded = data.get("downloaded_bytes") or 0
            if total > 0:
                pct = min(99, int(downloaded * 100 / total))
                label = f"Downloading Set… {pct}%"
            else:
                mb = downloaded / (1024 * 1024)
                label = f"Downloading Set… {mb:.1f} MB"
            if label != last_label[0]:
                last_label[0] = label
                job_state.mark_running(job_id, 1, [label])
        elif status == "finished":
            job_state.mark_running(job_id, 1, ["Processing audio…"])

    return hook


async def analyze_set_task(
    job_id: str,
    url: str,
    interval: int = 30
) -> dict:
    import yt_dlp
    from pydub import AudioSegment
    from ShazamAPI import Shazam


    results = []

    with tempfile.TemporaryDirectory() as temp_dir:
        audio_base = os.path.join(temp_dir, "set_audio")
        audio_file = f"{audio_base}.mp3"

        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': f'{audio_base}.%(ext)s',
            'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}],
            'quiet': True,
            'no_warnings': True,
            'socket_timeout': 30,
            'retries': 3,
            'fragment_retries': 5,
            'progress_hooks': [_download_progress_hook(job_id)],
        }

        job_state.mark_running(job_id, 1, ["Downloading Set… 0%"])

        def _download():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.extract_info(url, download=True)

        try:
            await asyncio.to_thread(_download)
        except Exception as e:
            job_state.mark_failed(job_id, f"Failed to download audio: {e}")
            return {"ok": False, "error": str(e)}

        if not os.path.exists(audio_file):
            # yt-dlp may leave intermediate ext before ffmpeg
            candidates = [
                p for p in os.listdir(temp_dir)
                if p.startswith("set_audio") and not p.endswith(".part")
            ]
            mp3 = next((p for p in candidates if p.endswith(".mp3")), None)
            if mp3:
                audio_file = os.path.join(temp_dir, mp3)
            else:
                job_state.mark_failed(job_id, "Audio file was not created.")
                return {"ok": False, "error": "No audio file"}

        job_state.mark_running(job_id, 1, ["Analyzing Audio"])

        try:
            def _load_audio():
                return AudioSegment.from_mp3(audio_file)
            audio = await asyncio.to_thread(_load_audio)
        except Exception as e:
            job_state.mark_failed(job_id, f"Failed to load audio: {e}")
            return {"ok": False, "error": str(e)}

        total_segments = len(audio) // (interval * 1000)
        last_confirmed = None
        pending_track = None
        pending_timestamp = None

        provider = get_provider_by_name("tidal")

        for i in range(total_segments):
            pct = int((i / max(total_segments, 1)) * 100)
            job_state.mark_running(job_id, 1, [f"Analyzing… {pct}%"])
            start_ms = i * interval * 1000
            end_ms = start_ms + 10000
            segment = audio[start_ms:end_ms]

            def _shazam_segment(seg):
                buffer = io.BytesIO()
                seg.export(buffer, format='wav')
                wav_bytes = buffer.getvalue()
                shazam = Shazam(wav_bytes)
                try:
                    res = next(shazam.recognizeSong(), None)
                    if res and len(res) > 1 and 'track' in res[1]:
                        track = res[1]['track']
                        artist = track.get('subtitle', 'Unknown')
                        title = track.get('title', 'Unknown')
                        return f"{artist} - {title}", artist, title
                except Exception:
                    pass
                return None, None, None

            current_track, current_artist, current_title = await asyncio.to_thread(_shazam_segment, segment)
            timestamp = f"{start_ms // 60000}:{(start_ms // 1000) % 60:02d}"

            if current_track:
                if current_track == last_confirmed:
                    pass
                elif current_track == pending_track:
                    track_info = {
                        "artist": current_artist or "Unknown",
                        "title": current_title or pending_track,
                        "timestamp": pending_timestamp,
                        "matched_track": None
                    }

                    if provider:
                        query = f"{track_info['artist']} {track_info['title']}"
                        try:
                            tidal_tracks = await asyncio.to_thread(provider.search, query, 1)
                            if tidal_tracks:
                                track_info["matched_track"] = tidal_tracks[0].model_dump()
                        except Exception:
                            pass

                    results.append(track_info)
                    job_state.update_set_tracks(job_id, results)

                    last_confirmed = current_track
                    pending_track = None
                else:
                    pending_track = current_track
                    pending_timestamp = timestamp
            else:
                pending_track = None

        if pending_track and pending_track != last_confirmed:
            track_info = {
                "artist": "Unknown",
                "title": pending_track,
                "timestamp": pending_timestamp,
                "matched_track": None,
            }
            if provider:
                try:
                    tidal_tracks = await asyncio.to_thread(provider.search, pending_track, 1)
                    if tidal_tracks:
                        track_info["matched_track"] = tidal_tracks[0].model_dump()
                except Exception:
                    pass
            results.append(track_info)
            job_state.update_set_tracks(job_id, results)

        job_state.mark_done(job_id)
        return {"ok": True, "count": len(results)}
