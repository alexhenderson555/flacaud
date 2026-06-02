# Tidal-DL-RU

Advanced high-fidelity DJ and Music Player Web Engine, supporting seamless library syncing from third-party services and native FLAC playback with Web Audio DJ tools.

## Features
- 🎛 **DJ Tools**: Interactive Camelot Wheel for harmonic mixing, Pitch/Tempo Vinyl sliders with key preservation.
- 🤖 **Auto-DJ**: Automatically finds the best harmonic track in your library to seamlessly mix.
- 📱 **PWA Offline**: Progressive Web App support to cache UI and assets offline.
- 🔀 **Gapless Crossfader**: Smooth fade transitions at the end of every track.
- 🎵 **Lossless Audio**: Directly streams high-resolution FLAC and MQA with real-time loudness compression.

## Getting Started
1. Copy `.env.example` to `.env` and fill the variables.
2. Run `docker compose up -d` to start the Postgres DB, Redis, Worker, Bot, and API.
3. The Frontend runs locally via `cd frontend && npm run dev`.
4. Access the web interface at `http://localhost:5173`.

## Tech Stack
- Backend: Python FastAPI, SQLAlchemy, Redis, Celery.
- Frontend: React + Vite, Framer Motion, Web Audio API.
