# Tidal-DL-RU

Advanced high-fidelity DJ and Music Player Web Engine, supporting seamless library syncing from third-party services and native FLAC playback with Web Audio DJ tools.

## Features
- 🎛 **DJ Tools**: Interactive Camelot Wheel for harmonic mixing, Pitch/Tempo Vinyl sliders with key preservation.
- 🤖 **Auto-DJ**: Automatically finds the best harmonic track in your library to seamlessly mix.
- 📱 **PWA Offline**: Progressive Web App support to cache UI and assets offline.
- 🔀 **Gapless Crossfader**: Smooth fade transitions at the end of every track.
- 🎵 **Lossless Audio**: Directly streams high-resolution FLAC and MQA with real-time loudness compression.

## Getting Started
1. Copy `.env.example` to `.env` and fill the variables. `TIDALDLRU_JWT_SECRET`
   and `TIDALDLRU_SIGNING_SECRET` are **required** (compose refuses to start
   without them) — generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
2. Build the frontend once: `cd frontend && npm install && npm run build` (the API serves `frontend/dist`).
3. Run `docker compose up -d` to start Redis, the API, the ARQ worker, and the Telegram bot.
4. Access the web interface at `http://localhost:${API_PORT}` (default port `8001`).

For frontend development with hot reload: `cd frontend && npm run dev` (Vite dev server on `http://localhost:5173`, proxying `/api` to the backend).

## Tech Stack
- **Backend**: Python 3.12, FastAPI, SQLAlchemy / SQLModel (SQLite), Redis + ARQ (job queue), aiogram (Telegram bot).
- **Audio**: own Tidal client (FLAC/Hi-Res), yt-dlp, demucs (stem split), syncedlyrics.
- **Frontend**: React + Vite + Tauri (PWA), Framer Motion, Web Audio API.
- **Payments**: YooKassa (server-verified webhooks).
