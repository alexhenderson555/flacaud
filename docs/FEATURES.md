# FlacAud — справочник функций и поведения

Last updated: **2026-06-17**. Живой документ для разработки и поддержки. Прод: **https://flacaud.ru**.

См. также: [ARCHITECTURE.md](../ARCHITECTURE.md), [DEPLOY.md](./DEPLOY.md), [SECURITY_AUDIT.md](./SECURITY_AUDIT.md), [ops/RUNBOOK.md](../ops/RUNBOOK.md).

---

## 1. Продуктовые возможности

| Область | Что умеет | Где в UI / API |
|--------|-----------|----------------|
| **Стриминг** | Lossless / Hi-Res / 320k с gapless, очередь, shuffle/repeat | Плеер, `GET /api/stream/...` |
| **Качество** | Ручной выбор tier, auto-mode, probe по manifest | `PlayerQualityPicker`, `GET /api/quality/.../available` |
| **Загрузки** | FLAC/ZIP jobs через ARQ | Account → history, `POST /api/jobs` |
| **Библиотека** | Like, плейлисты, guest → merge при логине | `/library`, `/playlists` |
| **Поиск** | Debounce 300 ms, fallback раскладки | `/search`, `POST /api/search` |
| **Shazam** | Распознавание с микрофона (без искусственной задержки) | Search, `POST /api/recognize` |
| **Рекомендации** | Персональные треки | `/recommendations` |
| **Genreverse** | Жанровое «радио» по vibe | `/genreverse` |
| **Sync** | Импорт Spotify / YouTube | `/sync`, `/api/transfer/*` |
| **Set Analyzer** | BPM/key/energy по миксу | `/analyzer` |
| **Stem Splitter** | Demucs: vocal/drums/bass/other | `/splitter` |
| **DJ** | Camelot, harmonic match, BPM/key в библиотеке | Library columns, wheel |
| **Караоке** | Синхронные lyrics, overlay, hotkey **K** | Player overlay |
| **Артист** | Портрет, bio (Gemini, auth), дискография | `/artist/:id` |
| **Оплата** | YooKassa, планы free/basic/pro | Account |
| **PWA** | Offline shell, precache без three.js | Service worker |

---

## 2. Плеер и качество звука

### Архитектура (frontend)

- **`PlayerLogic.jsx`** — renderless-обёртка: auth, quality, transport, persistence, media effects → Zustand `usePlayerStore`.
- **`GlobalAudio.jsx`** — два `<audio>` (main + preload), gapless handoff, watchdog `shouldStartPlayback`.
- **`usePlaybackQuality.js`** — probe tier, `changeQuality`, `streamRetryNonce`, defer в auto-mode при активном воспроизведении.

### Выбор качества (важно для поддержки)

1. **Probe:** `GET /api/quality/{provider}/{id}/available` смотрит codecs в DASH manifest → `available`, `downloadable`, `actual`.
2. **Стрим:** `GET /api/stream/...?quality=HIGH|LOSSLESS|HI_RES&mt=` — план может ограничить tier (`cap_stream_quality`).
3. **UI vs факт:** когда не идёт загрузка, `resolvePlayerUiQuality` показывает **доставленный** tier, а не только запрошенный.
4. **Повторный клик на тот же tier:** `changeQuality` всегда инкрементирует `streamRetryNonce` — иначе UI мог показывать 320k при Lossless (баг исправлен 2026-06).

### Режимы стрима (backend)

Лог и заголовок **`X-Stream-Mode`**:

| mode | Смысл |
|------|--------|
| `redirect` | Прямой range на CDN Tidal |
| `dash_stream` | Сегменты DASH → remux на диск → byte-range |
| `file` | Отдача из локального кэша/реестра |

DASH: первый ответ ждёт **полный** файл на диске (seek по всей длине).

---

## 3. Портреты артистов (без платных API)

**Файлы:** `src/tidal_dl_ru/server/artist_image.py`, `artist_image_cache.py`, `routers/catalog.py`.

### Цепочка (бесплатно, без ключей)

1. **Wikipedia / Wikimedia** — поиск страницы артиста, `pageimages` API; ru/en по наличию кириллицы в имени.
2. **Deezer** — `api.deezer.com/search/artist`, fuzzy match имени.
3. **iTunes** — Search API, upscale обложки `100x100` → `600x600`.
4. **Tidal** — fallback на picture из каталога Tidal.

Ответ API: `picture_url`, `picture_source` ∈ `wikimedia` | `deezer` | `itunes` | `tidal` | `none`.

### Кэш

- In-memory, TTL **`TIDALDLRU_ARTIST_IMAGE_CACHE_TTL`** (default **604800** = 7 дней).
- Отрицательный кэш (`none`) тоже кэшируется — не долбим внешние API.

### Прокси картинок

Фронт грузит через **`/api/image-proxy?url=`** (same-origin, CORS). Allowlist хостов в `media.py`:

- `*.tidal.com`, `*.tidalcdn.com`
- `*.wikimedia.org`, `*.wikipedia.org`
- `*.dzcdn.net` (Deezer)
- `*.mzstatic.com` (Apple)

SSRF: DNS resolve + блок private/loopback/link-local; только http(s).

**User-Agent** для Wikipedia: `TIDALDLRU_WIKI_USER_AGENT` (опционально).

---

## 4. Рекомендации и Genreverse

**Backend:** `server/recommendations.py`.

### Персональные рекомендации

`build_recommendations` — микс library signals + Tidal stubs, кэш `TIDALDLRU_REC_CACHE_TTL` (default 300 s).

### Genre / vibe radio

`build_track_radio`, `build_track_radio_fast` — бесконечная лента по seed.

### Обложки треков (исправление 2026-06)

Tidal radio/similar часто отдают **один и тот же UUID обложки** на разные треки.

- `_tracks_needing_cover_enrich` — треки с дублирующимся или пустым `cover`.
- `_finalize_track_covers` — batch `get_track` для уникальных обложек.
- Вызывается из `build_recommendations`, `build_track_radio*`.

**Frontend:** `Genreverse.jsx` — `enrichTracksFromApi` после загрузки; `TrackRow` — `key` на `<img>` включает `cover_url`.

---

## 5. Караоке

- Overlay с подсветкой строки; **smooth** scroll (`behavior: 'smooth'`).
- Hotkey **K** — toggle karaoke (когда lyrics доступны).
- Fullscreen на корне karaoke + `100dvh` (`frontend/src/styles/karaoke.css`).
- Анимации overlay: opacity ~0.55 s (framer-motion).

**Не ускоряли:** только API timing (poll transfer 300 ms, analyzer 1000 ms, search debounce 300 ms).

---

## 6. Визуализатор и Party mode

- **Web Audio** → `AudioVisualizer` / three.js (lazy chunk `vendor-three`).
- PWA precache **не** включает three.js (~884 KB) — грузится по требованию.
- Party mode — отдельный режим с 3D сценой; может быть скрыт по продуктовому решению.

---

## 7. Библиотека, sync, jobs

| Поток | Детали |
|-------|--------|
| Guest library | `localStorage` (`tidal-*`), merge на login |
| Transfer | Preview → import; poll **`TRANSFER_POLL_MS=300`** |
| Download job | Redis state `tidaldl:job:{id}`, worker `download_url` |
| Stem / analyze | ARQ, Demucs optional, disk cleanup cron |

Лимиты планов: `TIDALDLRU_FREE_LIMIT`, `BASIC_LIMIT`, `PRO_LIMIT`.

---

## 8. Auth и безопасность (кратко)

- Access JWT (~60 min) в `sessionStorage`; refresh HttpOnly cookie.
- Media token `?mt=` — itsdangerous, ~1 h, для stream/file.
- Artist **bio** (Gemini) — **только для авторизованных** (стоимость API).
- GDPR: `DELETE /api/auth/account`, `GET /api/auth/export`.
- Подробно: [SECURITY_AUDIT.md](./SECURITY_AUDIT.md).

---

## 9. Тесты (снимок 2026-06-17)

```bash
# Backend (~12 min full suite)
uv run pytest tests/ -q -k "not remote_flow_live"

# Frontend unit
cd frontend && npm run test

# E2E (нужен поднятый stack или CI env)
cd frontend && npm run e2e
```

| Suite | Результат |
|-------|-----------|
| **pytest** | **372 passed**, 2 skipped |
| **vitest** | **282 passed** (53 files) |
| **Playwright** | **60 pass**, 1 skipped (full suite; 2 library specs may retry under load) |

### Известные падающие E2E (UI drift, не блокер прод)

- `library-playlist.spec.js` — like + sequential stream
- `quality-fallback.spec.js`, `quality.spec.js`
- `queue-next-track.spec.js`, `queue-up-next.spec.js`
- `radio.spec.js` — Genreverse flow («Start Radio» → новый UI)
- `set-library.spec.js`

### Покрытие по областям

- `test_artist_image.py` — цепочка портретов, кэш
- `test_recommendations.py` — cover enrich
- `qualityPrefs.test.js` — UI quality / streamRetryNonce
- OpenAPI contract tests в pytest
- axe a11y smoke в Playwright

---

## 10. Переменные окружения (фичи)

| Variable | Назначение |
|----------|------------|
| `TIDALDLRU_ARTIST_IMAGE_CACHE_TTL` | TTL портретов (сек), default 7d |
| `TIDALDLRU_WIKI_USER_AGENT` | UA для Wikipedia API |
| `TIDALDLRU_REC_CACHE_TTL` | Кэш рекомендаций |
| `TIDALDLRU_LYRICS_CACHE` | Путь к disk cache lyrics |
| `GEMINI_API_KEY` | Bio + AI playlist |
| `TIDALDLRU_GEMINI_MODELS` | Fallback chain моделей |

Полный список: `.env.example`, [DEPLOY.md](./DEPLOY.md).

---

## 11. Генерация PDF/HTML документации

```bash
cd frontend && node ../docs/build_service_docs.mjs
```

Выход: `docs/FlacAud-Service-Documentation.html` и `.pdf` (Playwright Chromium).

После правок в `build_service_docs.mjs` перегенерируйте оба файла перед отдачей заказчику.

---

## 12. Easter eggs / polish

- **Landing cinema** — скрытый режим (KeyV), ключи в `landingCinemaKeys.js`, не привязан к layout DOM.
- **Player bar** — высота 72px (touch targets).
- Hard refresh после деплоя: **Ctrl+Shift+R** (кэш `/assets/*` на Cloudflare — см. [ops/SERVERS.md](../ops/SERVERS.md)).
