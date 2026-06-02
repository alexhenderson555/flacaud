#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🎧 DJ Set Analyzer - анализ DJ-сетов по ссылке
Скачивает аудио и определяет треки с таймингами
"""

import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import threading
import os
import sys
import json
from datetime import datetime
import subprocess

# Патч для скрытия консольных окон FFmpeg на Windows
if sys.platform == 'win32':
    _original_popen = subprocess.Popen
    def _hidden_popen(*args, **kwargs):
        if 'startupinfo' not in kwargs:
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            si.wShowWindow = subprocess.SW_HIDE
            kwargs['startupinfo'] = si
        if 'creationflags' not in kwargs:
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
        return _original_popen(*args, **kwargs)
    subprocess.Popen = _hidden_popen

# Настройка ffmpeg
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
FFMPEG_PATH = os.path.join(SCRIPT_DIR, "ffmpeg", "ffmpeg-8.0.1-full_build", "bin", "ffmpeg.exe")
FFPROBE_PATH = os.path.join(SCRIPT_DIR, "ffmpeg", "ffmpeg-8.0.1-full_build", "bin", "ffprobe.exe")

# Единая база треков (тот же Excel что и Musicnizer)
try:
    from music_recognizer import MusicDatabase
    MusicDatabase.EXCEL_FILE = os.path.join(SCRIPT_DIR, "recognized_tracks.xlsx")
    _database = MusicDatabase(db_path=os.path.join(SCRIPT_DIR, "recognized_tracks.db"))
    HAS_DATABASE = True
except Exception:
    HAS_DATABASE = False
    _database = None

if os.path.exists(FFMPEG_PATH):
    os.environ['PATH'] = os.path.dirname(FFMPEG_PATH) + os.pathsep + os.environ.get('PATH', '')


def analyze_set_extract_tracks(url, interval=30, progress_callback=None):
    """
    Анализирует сет (YT/SC) через Shazam, возвращает список {artist, title}.
    progress_callback(text: str, percent: int) — опционально.
    """
    temp_dir = os.path.join(SCRIPT_DIR, "temp_sets")
    os.makedirs(temp_dir, exist_ok=True)
    audio_file = os.path.join(temp_dir, "set_audio.mp3")
    results = []
    try:
        def prog(t, p):
            if progress_callback:
                progress_callback(t, p)

        import yt_dlp
        prog("Скачивание аудио...", 0)
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': audio_file.replace('.mp3', '.%(ext)s'),
            'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}],
            'ffmpeg_location': os.path.dirname(FFMPEG_PATH) if os.path.exists(FFMPEG_PATH) else None,
            'quiet': True, 'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
        duration = int(info.get('duration', 0) or 0)

        from pydub import AudioSegment
        AudioSegment.converter = FFMPEG_PATH
        AudioSegment.ffmpeg = FFMPEG_PATH
        AudioSegment.ffprobe = FFPROBE_PATH
        prog("Загрузка аудио...", 52)
        audio = AudioSegment.from_mp3(audio_file)

        from ShazamAPI import Shazam
        import io
        total_segments = len(audio) // (interval * 1000)
        last_confirmed = None
        pending_track = None
        pending_timestamp = None

        for i in range(total_segments):
            start_ms = i * interval * 1000
            end_ms = start_ms + 10000
            segment = audio[start_ms:end_ms]
            buffer = io.BytesIO()
            segment.export(buffer, format='wav')
            wav_bytes = buffer.getvalue()
            progress = 55 + int((i / max(1, total_segments)) * 45)
            timestamp = f"{start_ms // 60000}:{(start_ms // 1000) % 60:02d}"
            prog(f"Анализ {timestamp}...", progress)

            current_track = None
            try:
                shazam = Shazam(wav_bytes)
                result = next(shazam.recognizeSong(), None)
                if result and len(result) > 1 and 'track' in result[1]:
                    track = result[1]['track']
                    artist = track.get('subtitle', 'Unknown')
                    title = track.get('title', 'Unknown')
                    current_track = f"{artist} - {title}"
            except Exception:
                pass

            if current_track:
                if current_track == last_confirmed:
                    pass
                elif current_track == pending_track:
                    if ' - ' in pending_track:
                        a, t = pending_track.rsplit(' - ', 1)
                    else:
                        a, t = "Unknown", pending_track
                    results.append({'artist': a, 'title': t, 'timestamp': pending_timestamp})
                    last_confirmed = current_track
                    pending_track = None
                else:
                    pending_track = current_track
                    pending_timestamp = timestamp
            else:
                pending_track = None
    except Exception as e:
        raise e
    finally:
        try:
            if os.path.exists(audio_file):
                os.remove(audio_file)
        except Exception:
            pass
    return results


class ModernStyle:
    """Современная цветовая схема"""
    BG_DARK = "#0d1117"
    BG_CARD = "#161b22"
    BG_HOVER = "#21262d"
    ACCENT = "#58a6ff"
    ACCENT_GREEN = "#3fb950"
    ACCENT_RED = "#f85149"
    ACCENT_YELLOW = "#d29922"
    TEXT_PRIMARY = "#f0f6fc"
    TEXT_SECONDARY = "#8b949e"
    BORDER = "#30363d"


class SetAnalyzerApp:
    """Главное окно анализатора сетов"""
    
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("DJ Set Analyzer")
        self.root.geometry("700x720")
        self.root.configure(bg=ModernStyle.BG_DARK)
        
        self.is_analyzing = False
        self.results = []
        
        self._create_ui()
    
    def _create_ui(self):
        # Заголовок
        header = tk.Frame(self.root, bg=ModernStyle.BG_CARD, height=70)
        header.pack(fill='x')
        header.pack_propagate(False)
        
        tk.Label(
            header, text="🎧 DJ Set Analyzer",
            bg=ModernStyle.BG_CARD, fg=ModernStyle.TEXT_PRIMARY,
            font=("Segoe UI Semibold", 18)
        ).pack(pady=20)
        
        # Поле ввода URL
        url_frame = tk.Frame(self.root, bg=ModernStyle.BG_DARK)
        url_frame.pack(fill='x', padx=20, pady=20)
        
        tk.Label(
            url_frame, text="Ссылка на сет (YouTube, SoundCloud):",
            bg=ModernStyle.BG_DARK, fg=ModernStyle.TEXT_PRIMARY,
            font=("Segoe UI", 11)
        ).pack(anchor='w')
        
        self.url_entry = tk.Entry(
            url_frame, font=("Segoe UI", 12), width=60,
            bg=ModernStyle.BG_CARD, fg=ModernStyle.TEXT_PRIMARY,
            insertbackground=ModernStyle.TEXT_PRIMARY
        )
        self.url_entry.pack(fill='x', pady=(5, 0))
        
        # Настройки
        settings_frame = tk.Frame(self.root, bg=ModernStyle.BG_DARK)
        settings_frame.pack(fill='x', padx=20)
        
        tk.Label(
            settings_frame, text="Интервал анализа (сек):",
            bg=ModernStyle.BG_DARK, fg=ModernStyle.TEXT_SECONDARY,
            font=("Segoe UI", 10)
        ).pack(side='left')
        
        self.interval_var = tk.StringVar(value="30")
        interval_entry = tk.Entry(
            settings_frame, textvariable=self.interval_var, width=5,
            bg=ModernStyle.BG_CARD, fg=ModernStyle.TEXT_PRIMARY,
            font=("Segoe UI", 10)
        )
        interval_entry.pack(side='left', padx=(5, 20))
        
        # Кнопки
        btn_frame = tk.Frame(self.root, bg=ModernStyle.BG_DARK)
        btn_frame.pack(fill='x', padx=20, pady=15)
        
        self.analyze_btn = tk.Button(
            btn_frame, text="▶ Анализировать", bg=ModernStyle.ACCENT_GREEN,
            fg=ModernStyle.BG_DARK, font=("Segoe UI Semibold", 12),
            relief='flat', padx=20, pady=10, cursor="hand2",
            command=self._start_analysis
        )
        self.analyze_btn.pack(side='left')
        
        self.export_btn = tk.Button(
            btn_frame, text="💾 Экспорт", bg=ModernStyle.BG_CARD,
            fg=ModernStyle.TEXT_PRIMARY, font=("Segoe UI", 11),
            relief='flat', padx=15, pady=10, cursor="hand2",
            command=self._export_results, state='disabled'
        )
        self.export_btn.pack(side='left', padx=(10, 0))
        
        # Прогресс
        self.progress_label = tk.Label(
            self.root, text="", bg=ModernStyle.BG_DARK,
            fg=ModernStyle.TEXT_SECONDARY, font=("Segoe UI", 10)
        )
        self.progress_label.pack(fill='x', padx=20)
        
        self.progress_bar = ttk.Progressbar(
            self.root, mode='determinate', length=400
        )
        self.progress_bar.pack(fill='x', padx=20, pady=(5, 15))
        
        # Результаты
        results_frame = tk.Frame(self.root, bg=ModernStyle.BG_DARK)
        results_frame.pack(fill='both', expand=True, padx=20, pady=(0, 20))
        
        tk.Label(
            results_frame, text="📋 Найденные треки:",
            bg=ModernStyle.BG_DARK, fg=ModernStyle.TEXT_PRIMARY,
            font=("Segoe UI Semibold", 11)
        ).pack(anchor='w')
        
        # Список результатов
        list_frame = tk.Frame(results_frame, bg=ModernStyle.BG_CARD)
        list_frame.pack(fill='both', expand=True, pady=(5, 0))
        
        self.results_text = tk.Text(
            list_frame, bg=ModernStyle.BG_CARD, fg=ModernStyle.TEXT_PRIMARY,
            font=("Consolas", 10), wrap='word', cursor="arrow"
        )
        scrollbar = ttk.Scrollbar(list_frame, command=self.results_text.yview)
        self.results_text.configure(yscrollcommand=scrollbar.set)
        
        # Блокируем ввод, но разрешаем выделение и копирование
        self.results_text.bind("<Key>", lambda e: "break" if e.keysym not in ('c', 'C', 'a', 'A') or not (e.state & 4) else None)
        
        # Контекстное меню для копирования
        self.context_menu = tk.Menu(self.results_text, tearoff=0)
        self.context_menu.add_command(label="Копировать", command=self._copy_selection)
        self.context_menu.add_command(label="Выделить всё", command=self._select_all)
        self.results_text.bind("<Button-3>", self._show_context_menu)
        
        self.results_text.pack(side='left', fill='both', expand=True)
        scrollbar.pack(side='right', fill='y')
        
        # Секция: добавить треки в базу
        add_frame = tk.Frame(results_frame, bg=ModernStyle.BG_DARK)
        add_frame.pack(fill='x', pady=(15, 0))
        add_header = tk.Frame(add_frame, bg=ModernStyle.BG_DARK)
        add_header.pack(fill='x')
        tk.Label(
            add_header, text="➕ Добавить понравившиеся в единую базу (Excel):",
            bg=ModernStyle.BG_DARK, fg=ModernStyle.TEXT_PRIMARY,
            font=("Segoe UI", 10)
        ).pack(side='left')
        self.add_all_btn = tk.Button(
            add_header, text="➕ Добавить все", bg=ModernStyle.ACCENT_GREEN,
            fg=ModernStyle.BG_DARK, font=("Segoe UI", 9), relief='flat',
            padx=10, pady=2, cursor="hand2", command=self._add_all_tracks_to_db
        )
        self.add_all_btn.pack(side='right')
        self.add_all_btn.pack_forget()  # показываем после анализа
        self.tracks_add_frame = tk.Frame(add_frame, bg=ModernStyle.BG_DARK)
        self.tracks_add_frame.pack(fill='x', pady=(5, 0))
    
    def _show_context_menu(self, event):
        self.context_menu.tk_popup(event.x_root, event.y_root)
    
    def _copy_selection(self):
        try:
            text = self.results_text.get(tk.SEL_FIRST, tk.SEL_LAST)
            self.root.clipboard_clear()
            self.root.clipboard_append(text)
        except tk.TclError:
            pass  # Нет выделения
    
    def _select_all(self):
        self.results_text.tag_add(tk.SEL, "1.0", tk.END)
        self.results_text.mark_set(tk.INSERT, "1.0")
        self.results_text.see(tk.INSERT)
    
    def _start_analysis(self):
        url = self.url_entry.get().strip()
        if not url:
            messagebox.showwarning("Ошибка", "Введите ссылку на сет!")
            return
        
        self.is_analyzing = True
        self.results = []
        self.analyze_btn.configure(state='disabled', text="⏳ Анализ...")
        self.export_btn.configure(state='disabled')
        
        self.results_text.delete(1.0, tk.END)
        for w in self.tracks_add_frame.winfo_children():
            w.destroy()
        self.add_all_btn.pack_forget()
        
        threading.Thread(target=self._analyze_set, args=(url,), daemon=True).start()
    
    def _analyze_set(self, url):
        try:
            interval = int(self.interval_var.get())
        except:
            interval = 30
        
        temp_dir = os.path.join(SCRIPT_DIR, "temp_sets")
        os.makedirs(temp_dir, exist_ok=True)
        
        audio_file = os.path.join(temp_dir, "set_audio.mp3")
        
        try:
            # Шаг 1: Скачивание
            self._update_progress("Скачивание аудио...", 0)
            
            import yt_dlp
            
            def progress_hook(d):
                if d['status'] == 'downloading':
                    percent = d.get('_percent_str', '0%').strip().replace('%', '')
                    try:
                        pct = float(percent)
                        self._update_progress(f"Скачивание... {percent}%", int(pct * 0.5))
                    except:
                        pass
                elif d['status'] == 'finished':
                    self._update_progress("Конвертация в MP3...", 50)
            
            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': audio_file.replace('.mp3', '.%(ext)s'),
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
                'ffmpeg_location': os.path.dirname(FFMPEG_PATH) if os.path.exists(FFMPEG_PATH) else None,
                'quiet': True,
                'no_warnings': True,
                'progress_hooks': [progress_hook],
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                title = info.get('title', 'Unknown Set')
                duration = info.get('duration', 0)
            
            self._add_result(f"📁 Сет: {title}")
            duration = int(duration) if duration else 0
            self._add_result(f"⏱ Длительность: {duration // 60}:{duration % 60:02d}")
            self._add_result("-" * 50)
            
            # Шаг 2: Анализ по частям
            from pydub import AudioSegment
            AudioSegment.converter = FFMPEG_PATH
            AudioSegment.ffmpeg = FFMPEG_PATH
            AudioSegment.ffprobe = FFPROBE_PATH
            
            self._update_progress("Загрузка аудио в память...", 52)
            audio = AudioSegment.from_mp3(audio_file)
            
            total_segments = len(audio) // (interval * 1000)
            recognized_tracks = []
            last_confirmed = None
            pending_track = None
            pending_timestamp = None
            
            from ShazamAPI import Shazam
            from urllib.parse import quote
            import io
            
            for i in range(total_segments):
                start_ms = i * interval * 1000
                end_ms = start_ms + 10000  # 10 сек для распознавания
                
                segment = audio[start_ms:end_ms]
                
                # Конвертируем в WAV
                buffer = io.BytesIO()
                segment.export(buffer, format='wav')
                wav_bytes = buffer.getvalue()
                
                progress = 55 + int((i / total_segments) * 45)
                timestamp = f"{start_ms // 60000}:{(start_ms // 1000) % 60:02d}"
                self._update_progress(f"Анализ {timestamp}...", progress)
                
                current_track = None
                try:
                    shazam = Shazam(wav_bytes)
                    result = next(shazam.recognizeSong(), None)
                    
                    if result and len(result) > 1 and 'track' in result[1]:
                        track = result[1]['track']
                        artist = track.get('subtitle', 'Unknown')
                        title = track.get('title', 'Unknown')
                        current_track = f"{artist} - {title}"
                except:
                    pass
                
                # Логика подтверждения (2 раза подряд)
                if current_track:
                    if current_track == last_confirmed:
                        # Тот же трек продолжает играть
                        pass
                    elif current_track == pending_track:
                        # Подтвердился!
                        if ' - ' in pending_track:
                            artist, title = pending_track.rsplit(' - ', 1)
                        else:
                            artist, title = "Unknown", pending_track
                        yt_url = f"https://music.youtube.com/search?q={quote(pending_track)}"
                        
                        self._add_result(f"[{pending_timestamp}] {pending_track}")
                        self._add_result(f"    → {yt_url}")
                        self._add_result("")
                        
                        recognized_tracks.append({
                            'timestamp': pending_timestamp,
                            'start_ms': start_ms - interval * 1000,
                            'artist': artist,
                            'title': title,
                            'youtube_music_url': yt_url
                        })
                        last_confirmed = current_track
                        pending_track = None
                    else:
                        # Новый кандидат
                        pending_track = current_track
                        pending_timestamp = timestamp
                else:
                    pending_track = None
            
            self._add_result("-" * 50)
            self._add_result(f"✅ Найдено треков: {len(recognized_tracks)}")
            
            self.results = recognized_tracks
            self._update_progress("Готово!", 100)
            self.root.after(0, self._populate_add_tracks_ui)
            
            # Удаляем временный файл
            try:
                os.remove(audio_file)
            except:
                pass
            
        except Exception as e:
            self._add_result(f"❌ Ошибка: {str(e)}")
            self._update_progress("Ошибка", 0)
        
        finally:
            self.is_analyzing = False
            self.root.after(0, lambda: self.analyze_btn.configure(state='normal', text="▶ Анализировать"))
            if self.results:
                self.root.after(0, lambda: self.export_btn.configure(state='normal'))
    
    def _update_progress(self, text, value):
        self.root.after(0, lambda: self.progress_label.configure(text=text))
        self.root.after(0, lambda: self.progress_bar.configure(value=value))
    
    def _add_result(self, text):
        def update():
            self.results_text.insert(tk.END, text + "\n")
            self.results_text.see(tk.END)
        self.root.after(0, update)
    
    def _populate_add_tracks_ui(self):
        """Заполняет список треков с кнопками Добавить в базу"""
        for w in self.tracks_add_frame.winfo_children():
            w.destroy()
        if not HAS_DATABASE or not self.results:
            return
        self.add_all_btn.pack(side='right')
        from urllib.parse import quote
        for t in self.results:
            row = tk.Frame(self.tracks_add_frame, bg=ModernStyle.BG_DARK)
            row.pack(fill='x', pady=2)
            artist = t.get('artist', '')
            title = t.get('title', '')
            label = tk.Label(
                row, text=f"{artist} — {title}", bg=ModernStyle.BG_DARK,
                fg=ModernStyle.TEXT_PRIMARY, font=("Segoe UI", 9)
            )
            label.pack(side='left')
            add_btn = tk.Button(
                row, text="➕ В базу", bg=ModernStyle.ACCENT_GREEN, fg=ModernStyle.BG_DARK,
                font=("Segoe UI", 8), relief='flat', padx=8, pady=2, cursor="hand2",
                command=lambda tr=t: self._add_track_to_db(tr, add_btn)
            )
            add_btn.pack(side='right')
    
    def _add_track_to_db(self, track_info, btn):
        """Добавляет трек в единую базу (Excel + DB)"""
        if not HAS_DATABASE:
            messagebox.showinfo("", "База не подключена")
            return
        from urllib.parse import quote
        q = f"{track_info.get('artist', '')} {track_info.get('title', '')}"
        enc = quote(q)
        full_info = {
            'artist': track_info.get('artist', 'Unknown'),
            'title': track_info.get('title', 'Unknown'),
            'album': '',
            'youtube_music_url': track_info.get('youtube_music_url') or f"https://music.youtube.com/search?q={enc}",
            'spotify_url': f"https://open.spotify.com/search/{enc}",
            'soundcloud_url': f"https://soundcloud.com/search?q={enc}",
        }
        try:
            is_new, tid = _database.add_track(full_info)
            btn.configure(text="✓", state='disabled')
        except Exception as e:
            messagebox.showerror("Ошибка", str(e))
    
    def _add_all_tracks_to_db(self):
        """Добавляет все треки в базу"""
        if not HAS_DATABASE or not self.results:
            return
        from urllib.parse import quote
        added, skipped = 0, 0
        for t in self.results:
            q = f"{t.get('artist', '')} {t.get('title', '')}"
            enc = quote(q)
            full_info = {
                'artist': t.get('artist', 'Unknown'),
                'title': t.get('title', 'Unknown'),
                'album': '',
                'youtube_music_url': t.get('youtube_music_url') or f"https://music.youtube.com/search?q={enc}",
                'spotify_url': f"https://open.spotify.com/search/{enc}",
                'soundcloud_url': f"https://soundcloud.com/search?q={enc}",
            }
            try:
                is_new, _ = _database.add_track(full_info)
                added += 1 if is_new else 0
                skipped += 0 if is_new else 1
            except Exception:
                pass
        messagebox.showinfo("Готово", f"Добавлено новых: {added}, уже были: {skipped}")
    
    def _export_results(self):
        if not self.results:
            return
        
        filename = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("Text files", "*.txt"), ("JSON", "*.json")],
            title="Сохранить результаты"
        )
        
        if filename:
            if filename.endswith('.json'):
                with open(filename, 'w', encoding='utf-8') as f:
                    json.dump(self.results, f, ensure_ascii=False, indent=2)
            else:
                with open(filename, 'w', encoding='utf-8') as f:
                    for track in self.results:
                        f.write(f"[{track['timestamp']}] {track['artist']} - {track['title']}\n")
                        f.write(f"    → {track.get('youtube_music_url', '')}\n\n")
            
            messagebox.showinfo("Готово", f"Сохранено: {filename}")
    
    def run(self):
        self.root.mainloop()


def main():
    app = SetAnalyzerApp()
    if len(sys.argv) > 1:
        url = sys.argv[1]
        if url and url.startswith(('http://', 'https://')):
            app.url_entry.insert(0, url)
    app.run()


if __name__ == "__main__":
    main()
