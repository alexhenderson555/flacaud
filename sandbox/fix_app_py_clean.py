import sys
path = 'src/tidal_dl_ru/server/app.py'

original_chunk = """
        lock = stream_locks[track_id]
        try:
            async with lock:
                # Look for existing cached file
                for ext in [".m4a", ".flac", ".mp4", ".eac3"]:
                    cached_file = cache_dir / f"{track_id}_{q_enum.name}{ext}"
                    if cached_file.exists():
                        media_type = "audio/flac" if ext == ".flac" else "audio/mp4"
                        return FileResponse(cached_file, headers={"Access-Control-Allow-Origin": "*"}, media_type=media_type)
                    
                def _dl():
                    with p._client() as c:
                        manifest = c.get_playback_manifest(track_id, q_enum)
                        
                        # Fallback sequence to guarantee a BTS (direct URL) manifest for instant streaming
                        qualities_to_try = [q_enum]
                        if q_enum == getattr(AudioQuality, "HI_RES_LOSSLESS", None):
                            qualities_to_try += [AudioQuality.LOSSLESS, AudioQuality.HIGH, AudioQuality.LOW]
                        elif q_enum == AudioQuality.LOSSLESS:
                            qualities_to_try += [AudioQuality.HIGH, AudioQuality.LOW]
                        elif q_enum == AudioQuality.HIGH:
                            qualities_to_try += [AudioQuality.LOW]
                            
                        import base64
                        import json
                        
                        # We aggressively look for 'application/vnd.tidal.bts' which gives direct URLs.
                        for q in qualities_to_try:
                            try:
                                manifest = c.get_playback_manifest(track_id, q)
                                if manifest.manifest_mime_type == "application/vnd.tidal.bts":
                                    raw = base64.b64decode(manifest.manifest)
                                    data = json.loads(raw)
                                    urls = data.get("urls", [])
                                    if urls:
                                        return {"type": "redirect", "url": urls[0], "actual_quality": manifest.audio_quality}
                                elif manifest.manifest_mime_type == "application/dash+xml":
                                    return {"type": "dash_stream", "manifest": manifest, "actual_quality": manifest.audio_quality}
                            except Exception as e:
                                continue
                        
                        # If we absolutely exhausted everything and it's ONLY DASH
                        manifest = c.get_playback_manifest(track_id, AudioQuality.LOW)
                        tmp_dest = cache_dir / f"{track_id}_{AudioQuality.LOW.name}"
                        final_path = download_track(c._http, manifest, tmp_dest)
                        return {"type": "file", "path": final_path, "actual_quality": manifest.audio_quality}
                    
                res = await asyncio.to_thread(_dl)
"""

with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# We need to find `lock = stream_locks[track_id]` and everything up to `res = await asyncio.to_thread(_dl)` and replace it.
start_idx = text.find('        lock = stream_locks[track_id]')
if start_idx == -1:
    print('Could not find start')
    sys.exit(1)

end_idx = text.find('            if res["type"] == "redirect":', start_idx)
if end_idx == -1:
    print('Could not find end')
    sys.exit(1)

new_text = text[:start_idx] + original_chunk.lstrip('\n') + "\n" + text[end_idx:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_text)
print('Done.')
