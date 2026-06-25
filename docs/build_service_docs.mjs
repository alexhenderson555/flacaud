// Generates the full FlacAud service documentation as a self-contained HTML
// file and renders it to PDF with Playwright's bundled Chromium.
//   cd frontend && node ../docs/build_service_docs.mjs
// Output: docs/FlacAud-Service-Documentation.{html,pdf}
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const DOCS_DIR = dirname(fileURLToPath(import.meta.url));
// Playwright lives in frontend/node_modules; anchor CJS resolution there so this
// script runs from anywhere.
const require = createRequire(join(DOCS_DIR, '..', 'frontend', 'package.json'));
const { chromium } = require('playwright');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ----------------------------- SVG diagram helpers ----------------------------- */

// Sequence diagram from a compact spec.
// actors: [label]; steps: [{from, to, label, dashed?, self?}]
function seq(actors, steps) {
  const W = 760;
  const colW = W / actors.length;
  const colX = (i) => Math.round(colW * i + colW / 2);
  const idx = Object.fromEntries(actors.map((a, i) => [a, i]));
  const topH = 46;
  const rowH = 44;
  const startY = topH + 26;
  const H = startY + steps.length * rowH + 24;

  const lifelines = actors
    .map((a, i) => {
      const x = colX(i);
      return `<line x1="${x}" y1="${topH}" x2="${x}" y2="${H - 14}" stroke="#cfd6e4" stroke-width="1" stroke-dasharray="3 4"/>`;
    })
    .join('');

  const heads = actors
    .map((a, i) => {
      const x = colX(i);
      const w = Math.min(colW - 16, 150);
      return `<rect x="${x - w / 2}" y="8" width="${w}" height="30" rx="6" fill="#1f2a44" stroke="#34406a"/>`
        + `<text x="${x}" y="27" text-anchor="middle" class="actor">${esc(a)}</text>`;
    })
    .join('');

  const rows = steps
    .map((s, r) => {
      const y = startY + r * rowH;
      const fi = idx[s.from];
      const ti = idx[s.to];
      const x1 = colX(fi);
      const x2 = colX(ti);
      const dash = s.dashed ? ' stroke-dasharray="5 4"' : '';
      const num = `<text x="6" y="${y - 6}" class="snum">${r + 1}</text>`;
      if (s.self || fi === ti) {
        const x = x1;
        const loop = `<path d="M ${x} ${y - 8} h 46 v 20 h -46" fill="none" stroke="#5b6b91" stroke-width="1.4"${dash}/>`
          + `<polygon points="${x + 6},${y + 12} ${x - 2},${y + 8} ${x + 6},${y + 4}" fill="#5b6b91"/>`;
        return `${num}${loop}<text x="${x + 52}" y="${y - 2}" class="msg">${esc(s.label)}</text>`;
      }
      const dir = x2 > x1 ? 1 : -1;
      const ax = x2 - dir * 7;
      const arrow = `<line x1="${x1}" y1="${y}" x2="${ax}" y2="${y}" stroke="#3b82f6" stroke-width="1.6"${dash}/>`
        + `<polygon points="${x2},${y} ${ax - dir * 1},${y - 4} ${ax - dir * 1},${y + 4}" fill="#3b82f6"/>`;
      const tx = (x1 + x2) / 2;
      return `${num}${arrow}<text x="${tx}" y="${y - 7}" text-anchor="middle" class="msg">${esc(s.label)}</text>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" class="diagram">`
    + `${lifelines}${heads}${rows}</svg>`;
}

function archDiagram() {
  const box = (x, y, w, h, label, sub, fill = '#1f2a44') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="#34406a"/>`
    + `<text x="${x + w / 2}" y="${y + (sub ? 22 : h / 2 + 4)}" text-anchor="middle" class="bx">${esc(label)}</text>`
    + (sub ? `<text x="${x + w / 2}" y="${y + 40}" text-anchor="middle" class="bxs">${esc(sub)}</text>` : '');
  const arr = (x1, y1, x2, y2) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#3b82f6" stroke-width="1.6" marker-end="url(#ah)"/>`;
  return `<svg viewBox="0 0 760 430" width="100%" xmlns="http://www.w3.org/2000/svg" class="diagram">`
    + `<defs><marker id="ah" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><polygon points="0,0 8,3 0,6" fill="#3b82f6"/></marker></defs>`
    + box(300, 10, 160, 52, 'Browser / PWA', 'React + Vite + Tauri', '#243156')
    + arr(380, 62, 380, 92)
    + box(300, 92, 160, 52, 'Caddy', 'TLS · static dist · /api proxy')
    + arr(380, 144, 380, 174)
    + box(300, 174, 160, 56, 'FastAPI (api)', 'routers + middleware')
    + arr(300, 202, 150, 202) + box(20, 174, 130, 56, 'Telegram Bot', 'aiogram')
    + arr(460, 202, 610, 202) + box(610, 174, 130, 56, 'ARQ Worker', 'downloads/analyze')
    + arr(380, 230, 380, 262)
    + box(300, 262, 160, 50, 'Redis', 'job state · queue · rate-limit')
    + arr(150, 312, 120, 350) + arr(610, 312, 640, 350)
    + box(40, 320, 200, 56, 'SQLite/Postgres', 'users · playlists · sets')
    + box(280, 320, 200, 56, 'Tidal account pool', 'Fernet-encrypted (pool.db)')
    + box(520, 320, 220, 56, 'External APIs', 'Tidal·YooKassa·Gemini·yt-dlp')
    + `<text x="380" y="400" text-anchor="middle" class="bxs">Tidal traffic egresses via a Marzban/Xray VLESS proxy (separate VPS) to bypass RU geo-block</text>`
    + `</svg>`;
}

/* ----------------------------- Document content ----------------------------- */

const FEATURES = [
  ['Player', 'Dual-slot &lt;audio&gt; engine (gapless handoff, optional crossfade), shuffle/repeat, Web Audio visualizer, MediaSession + OS controls, hotkeys. Wired by PlayerLogic.jsx → usePlayerTransport → usePlayerQueue.'],
  ['Quality selection', 'Per-track probe of available tiers (HIGH / LOSSLESS / HI_RES) by sniffing the DASH manifest codecs; auto-quality mode; capped per subscription plan; PlayerQualityPicker.'],
  ['Downloads', 'Server-side jobs via POST /api/jobs → ARQ worker → signed file tokens; service-worker cache; progress toasts; history on Account.'],
  ['Library & playlists', 'Like/unlike and playlist CRUD synced to /api/library and /api/playlists; guest mode in localStorage auto-merged on login.'],
  ['Search & Shazam', 'Debounced full-text search with alternate keyboard-layout fallback; microphone audio-fingerprint recognition via /api/recognize.'],
  ['Recommendations & Radio', 'Personalized tracks (/api/recommendations) and endless "vibe" radio at /genreverse seeded by genre/mood/library.'],
  ['Sync / transfer', 'Import library and playlists from Spotify / YouTube: preview then import via /api/transfer/*.'],
  ['Set Analyzer', 'Upload a DJ mix → async analyze job → BPM / key / energy timeline and tracklist recognition.'],
  ['Stem Splitter', 'Demucs-based separation of a track into vocals / drums / bass / other, delivered as downloadable stems.'],
  ['DJ tools', 'BPM / key / Camelot metadata, Camelot wheel, harmonic next-track matching; gated by plan + dj_enabled.'],
  ['Lyrics & Karaoke', 'Time-synced lyrics (/api/lyrics) with active-line tracking; karaoke overlay; optional translation.'],
  ['Party mode', 'Shared visualizer/session mode gated behind plan check.'],
];

const ENDPOINTS = [
  ['POST', '/api/auth/login · /register · /refresh · /logout', 'Web auth; JWT access token + rotating HttpOnly refresh cookie'],
  ['GET', '/api/auth/me', 'Validate session, return profile + effective plan'],
  ['GET', '/api/auth/media-token', 'Mint a 1h itsdangerous media token for stream/file URLs'],
  ['GET', '/api/search · POST /api/recognize', 'Track search; microphone fingerprint recognition'],
  ['POST', '/api/ai-playlist · GET /api/recommendations', 'AI playlist from a vibe; personalized recommendations'],
  ['GET', '/api/stream/{provider}/{id}', 'Range-capable audio stream (?quality=&mt=)'],
  ['GET', '/api/quality/{provider}/{id}/available', 'Per-track quality probe (available/downloadable/actual)'],
  ['GET', '/api/track/{provider}/{id}', 'Full track metadata; /dj-meta for BPM/key'],
  ['CRUD', '/api/library · /api/playlists', 'Liked tracks and playlists'],
  ['POST', '/api/jobs · GET /api/jobs/{id} · /{id}/zip', 'Create download/analyze/stem job, poll, zip download'],
  ['GET', '/api/files/{token}', 'Download a completed artifact via signed token'],
  ['POST', '/api/payments/create', 'Create a YooKassa payment, return confirmation URL'],
  ['POST', '/api/webhooks/yookassa', 'Payment webhook (re-verified server-side against YooKassa API)'],
  ['POST', '/api/transfer/preview · /import', 'External playlist import (Spotify/YouTube)'],
  ['GET', '/api/image-proxy', 'SSRF-hardened cover-art proxy (Tidal CDN allowlist)'],
];

const ENVVARS = [
  ['TIDALDLRU_JWT_SECRET', 'HS256 signing key for access tokens (required in prod)'],
  ['TIDALDLRU_SIGNING_SECRET', 'itsdangerous key for media/file/reset tokens (required in prod)'],
  ['TIDALDLRU_BOT_TOKEN', 'Telegram bot token'],
  ['DOMAIN / ACME_EMAIL', 'Caddy host + Let’s Encrypt contact'],
  ['REDIS_URL', 'Redis connection (job state, queue, rate-limit)'],
  ['DATABASE_URL', 'Postgres DSN (SQLite by default)'],
  ['TIDALDLRU_POOL_KEY', 'Fernet key for the encrypted Tidal account pool (must persist)'],
  ['TIDALDLRU_YOOKASSA_SHOP_ID / _SECRET_KEY', 'YooKassa payment credentials'],
  ['TIDALDLRU_OPS_API_KEY', 'Gate for /api/metrics, /api/logs, /api/pool/health'],
  ['TIDALDLRU_PKCE_CLIENT_ID / _SECRET', 'Tidal OAuth (PKCE) credentials'],
  ['TIDALDLRU_FORWARDED_ALLOW_IPS', 'Trusted proxy IPs for forwarded headers'],
  ['GEMINI_API_KEY · SPOTIPY_* · RESEND_API_KEY', 'AI playlists · Spotify import · transactional email'],
];

const diagrams = {
  download: seq(
    ['Browser', 'FastAPI', 'Redis', 'ARQ worker', 'Tidal pool'],
    [
      { from: 'Browser', to: 'FastAPI', label: 'POST /api/jobs (JWT)' },
      { from: 'FastAPI', to: 'FastAPI', label: 'reserve_web_download + cap_stream_quality', self: true },
      { from: 'FastAPI', to: 'Redis', label: 'job_state.create (status=queued)' },
      { from: 'FastAPI', to: 'Redis', label: 'arq enqueue download_url' },
      { from: 'FastAPI', to: 'Browser', label: 'job_id', dashed: true },
      { from: 'Redis', to: 'ARQ worker', label: 'dispatch download_url' },
      { from: 'ARQ worker', to: 'Tidal pool', label: 'expand + download tracks' },
      { from: 'ARQ worker', to: 'Redis', label: 'update_track + mark_done (file_token)' },
      { from: 'Browser', to: 'FastAPI', label: 'GET /api/jobs/{id} (poll)' },
      { from: 'Browser', to: 'FastAPI', label: 'GET /api/files/{token} → verify_file' },
      { from: 'FastAPI', to: 'Browser', label: 'FileResponse (audio)', dashed: true },
    ],
  ),
  stream: seq(
    ['Browser', 'FastAPI', 'Tidal pool', 'Stream cache'],
    [
      { from: 'Browser', to: 'FastAPI', label: 'GET /api/quality/.../available (?mt=)' },
      { from: 'FastAPI', to: 'Tidal pool', label: 'probe_tidal_qualities (sniff manifest codecs)' },
      { from: 'FastAPI', to: 'Browser', label: 'available/downloadable/actual', dashed: true },
      { from: 'Browser', to: 'FastAPI', label: 'GET /api/stream/.../{id}?quality=&mt=' },
      { from: 'FastAPI', to: 'FastAPI', label: 'cap_stream_quality + registry shortcut', self: true },
      { from: 'FastAPI', to: 'Tidal pool', label: 'fetch_playback_manifest (DASH/BTS)' },
      { from: 'FastAPI', to: 'Stream cache', label: 'fetch+remux segments (file-locked)' },
      { from: 'FastAPI', to: 'Browser', label: 'ranged 206 audio/flac', dashed: true },
    ],
  ),
  auth: seq(
    ['Browser', 'FastAPI', 'DB'],
    [
      { from: 'Browser', to: 'FastAPI', label: 'POST /api/auth/login' },
      { from: 'FastAPI', to: 'DB', label: 'verify_password (bcrypt)' },
      { from: 'FastAPI', to: 'DB', label: 'issue_refresh_token (hashed)' },
      { from: 'FastAPI', to: 'Browser', label: 'access JWT + HttpOnly refresh cookie', dashed: true },
      { from: 'Browser', to: 'FastAPI', label: 'GET /api/auth/media-token (JWT)' },
      { from: 'FastAPI', to: 'Browser', label: 'sign_media_token (1h, itsdangerous)', dashed: true },
      { from: 'Browser', to: 'FastAPI', label: 'POST /api/auth/refresh (cookie)' },
      { from: 'FastAPI', to: 'DB', label: 'consume + rotate refresh token' },
      { from: 'FastAPI', to: 'Browser', label: 'new access JWT', dashed: true },
    ],
  ),
  payment: seq(
    ['Browser', 'FastAPI', 'YooKassa', 'DB'],
    [
      { from: 'Browser', to: 'FastAPI', label: 'POST /api/payments/create' },
      { from: 'FastAPI', to: 'YooKassa', label: 'create_payment (idempotence key)' },
      { from: 'FastAPI', to: 'Browser', label: 'confirmation_url', dashed: true },
      { from: 'YooKassa', to: 'FastAPI', label: 'POST /api/webhooks/yookassa (payment.succeeded)' },
      { from: 'FastAPI', to: 'YooKassa', label: '_fetch_payment (re-verify, never trust body)' },
      { from: 'FastAPI', to: 'FastAPI', label: 'check status/paid/amount', self: true },
      { from: 'FastAPI', to: 'DB', label: 'apply_paid_plan + stack expiry' },
    ],
  ),
  pool: seq(
    ['Caller', 'Pool (SQLite)', 'Tidal OAuth'],
    [
      { from: 'Caller', to: 'Pool (SQLite)', label: 'acquire(exclude_ids)' },
      { from: 'Pool (SQLite)', to: 'Pool (SQLite)', label: 'pick active acct, quota ok, LRU, not in cooldown', self: true },
      { from: 'Pool (SQLite)', to: 'Tidal OAuth', label: 'refresh_tidal_token (PKCE→device fallback)' },
      { from: 'Tidal OAuth', to: 'Pool (SQLite)', label: 'TokenSet (persist rotated refresh)', dashed: true },
      { from: 'Pool (SQLite)', to: 'Caller', label: 'TokenSet', dashed: true },
      { from: 'Caller', to: 'Pool (SQLite)', label: 'report_success / report_rate_limited(429) / report_failure(401)' },
    ],
  ),
  player: seq(
    ['User', 'usePlayerQueue', 'usePlaybackQuality', 'GlobalAudio', '<audio>'],
    [
      { from: 'User', to: 'usePlayerQueue', label: 'click track → togglePlay → beginPlayback' },
      { from: 'usePlayerQueue', to: 'usePlayerQueue', label: 'pendingPlayRef=true; clear src; setCurrentTrack', self: true },
      { from: 'usePlayerQueue', to: 'usePlaybackQuality', label: 'currentTrack change → probe quality' },
      { from: 'usePlaybackQuality', to: 'GlobalAudio', label: 'setCurrentAudioSrc(streamUrl)' },
      { from: 'GlobalAudio', to: '<audio>', label: 'el.src = streamUrl' },
      { from: 'GlobalAudio', to: 'GlobalAudio', label: 'watchdog: shouldStartPlayback? poll until playing', self: true },
      { from: 'GlobalAudio', to: '<audio>', label: 'el.play()' },
    ],
  ),
};

const knownIssues = {
  fixed: [
    'Player "stays put until 2nd click": play-gate accepted only stale currentSrc and the retry net gave up after ~300ms. Fixed with a pure shouldStartPlayback gate (matches el.src OR currentSrc) + a single bounded watchdog (GlobalAudio.jsx, playerTransportLogic.js). +9 unit tests.',
    'Stream concurrency crash: streaming.py polled task.done() when task was None (another request owned the merge) → AttributeError. Guarded both sites.',
    'Zip path traversal: /api/jobs/{job_id}/zip used job_id directly as a path segment; now rejects non-hex ids.',
    'Artist names: normalizeArtists did artists.map(String) → "[object Object]" for object-shaped artists; now extracts name/title and drops empties.',
    'Search alt-layout fallback called .json() on non-OK responses; now guarded.',
    'Secret hygiene: Xray REALITY configs (private keys) untracked from git + ignored (see note below).',
  ],
  open: [
    ['critical', 'Xray REALITY private keys remain in git HISTORY. Rotate the key pairs on the Marzban server and purge history (git filter-repo); untracking only stops future commits.'],
    ['high', 'Token reads bypass tokenStorage in ~10 frontend sites (library.js, Search.jsx, etc.) → stale token after refresh → silent 401s. Centralize on getAccessToken().'],
    ['high', 'Two ApiError class definitions (apiClient.js vs apiFetchCore.js) break instanceof across modules.'],
    ['high', 'API runs --workers 2 with an in-memory rate-limit fallback (per-process) → limits effectively doubled when Redis is down. Use 1 worker or fail fast to Redis.'],
    ['high', 'Containers run as root (Dockerfile.api/worker have no USER). Add a non-root user.'],
    ['medium', 'GET /api/auth/tidal-login, /callback, /status are unauthenticated and unrated — gate behind ops key.'],
    ['medium', 'downloaded_tracks.json registry written by multiple workers without a file lock → lost writes. Use filelock.'],
    ['medium', 'Pool.acquire() does not report_failure on AuthError → bad-token account stays active/idle.'],
    ['medium', 'Webhook trusts leftmost X-Forwarded-For for the IP allowlist (spoofable); mitigated by server-side re-verify, but the IP check gives false confidence.'],
    ['medium', 'CSP uses unsafe-inline for script-src/style-src; in-process DASH/probe caches are unbounded (memory growth).'],
  ],
};

/* ----------------------------- HTML assembly ----------------------------- */

const featureRows = FEATURES.map(([n, d]) => `<tr><td class="k">${n}</td><td>${d}</td></tr>`).join('');
const endpointRows = ENDPOINTS.map(([m, p, d]) => `<tr><td class="mono b">${esc(m)}</td><td class="mono">${esc(p)}</td><td>${esc(d)}</td></tr>`).join('');
const envRows = ENVVARS.map(([n, d]) => `<tr><td class="mono">${esc(n)}</td><td>${esc(d)}</td></tr>`).join('');
const fixedRows = knownIssues.fixed.map((x) => `<li>${x}</li>`).join('');
const openRows = knownIssues.open
  .map(([sev, x]) => `<tr><td><span class="sev sev-${sev}">${sev}</span></td><td>${esc(x)}</td></tr>`)
  .join('');

const diagramBlock = (title, sub, svg) =>
  `<figure class="fig"><figcaption><b>${esc(title)}</b> — ${esc(sub)}</figcaption>${svg}</figure>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>FlacAud — Service Documentation</title>
<style>
  :root { --ink:#1a2030; --muted:#5b6577; --line:#dce1ea; --accent:#2563eb; --bg:#fff; }
  * { box-sizing: border-box; }
  body { font: 13px/1.55 -apple-system,Segoe UI,Roboto,Inter,sans-serif; color: var(--ink); margin: 0; }
  .page { padding: 0 6mm; }
  h1 { font-size: 30px; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 26px 0 8px; padding-top: 8px; border-top: 2px solid var(--accent); page-break-after: avoid; }
  h3 { font-size: 15px; margin: 16px 0 6px; color: #28324a; page-break-after: avoid; }
  p { margin: 6px 0; }
  .muted { color: var(--muted); }
  .mono, code { font-family: ui-monospace,SFMono-Regular,Consolas,monospace; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 12px; }
  th, td { text-align: left; vertical-align: top; padding: 5px 8px; border-bottom: 1px solid var(--line); }
  th { background: #f1f4fa; color: #2a3550; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
  td.k { font-weight: 600; white-space: nowrap; color: #28324a; }
  td.b, .b { font-weight: 700; }
  ul, ol { margin: 6px 0; padding-left: 20px; }
  li { margin: 3px 0; }
  .fig { margin: 12px 0 18px; page-break-inside: avoid; }
  .fig figcaption { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
  .diagram { border: 1px solid var(--line); border-radius: 8px; background: #fafbfe; }
  .diagram .actor { fill: #eaf0ff; font: 600 11px sans-serif; }
  .diagram .bx { fill: #eaf0ff; font: 600 12px sans-serif; }
  .diagram .bxs { fill: #aab6d4; font: 10px sans-serif; }
  .diagram .msg { fill: #2a3550; font: 10.5px sans-serif; }
  .diagram .snum { fill: #9aa6bf; font: 9px sans-serif; }
  .cover { height: 246mm; display: flex; flex-direction: column; justify-content: center; }
  .cover .sub { font-size: 16px; color: var(--muted); margin-top: 2px; }
  .badge { display:inline-block; margin-top:18px; padding:4px 10px; border:1px solid var(--line); border-radius:20px; font-size:12px; color:var(--muted); }
  .toc ol { columns: 2; column-gap: 24px; }
  .note { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 8px 12px; margin: 10px 0; font-size: 12px; }
  .sev { font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 1px 6px; border-radius: 4px; color: #fff; }
  .sev-critical { background:#b91c1c; } .sev-high { background:#c2410c; } .sev-medium { background:#a16207; }
  .pagebreak { page-break-before: always; }
  @page { size: A4; margin: 14mm 10mm; }
</style></head><body><div class="page">

<section class="cover">
  <h1>FlacAud — Service Documentation</h1>
  <div class="sub">Architecture, interactions, sequence flows, features, API, security &amp; known issues</div>
  <div class="badge">Multi-source music downloader &amp; player · FastAPI + ARQ + aiogram · React/Vite/Tauri PWA</div>
  <p class="muted" style="margin-top:24px">Generated from a full-codebase review. Diagrams are derived from the current source; file paths are cited so each flow can be traced. Internal engineering reference.</p>
</section>

<div class="pagebreak"></div>
<h2 id="toc">Contents</h2>
<nav class="toc"><ol>
  <li>Overview &amp; purpose</li>
  <li>System architecture</li>
  <li>Tech stack</li>
  <li>Deployment topology</li>
  <li>Data models</li>
  <li>Sequence flows (download, streaming, auth, payment, pool, player)</li>
  <li>Feature catalog</li>
  <li>Frontend architecture</li>
  <li>API reference</li>
  <li>Security model</li>
  <li>Environment variables</li>
  <li>Known issues &amp; tech debt</li>
</ol></nav>

<h2>1 · Overview &amp; purpose</h2>
<p>FlacAud is a multi-source music downloader and streaming player for the Russian market. Tidal is accessed through the project's own client (OAuth device-flow + PKCE, BTS/DASH manifests, a Fernet-encrypted account pool); other sources go through yt-dlp. The product is delivered as a web/PWA + Tauri desktop frontend, a FastAPI backend with an ARQ worker, and a Telegram bot, monetized via YooKassa subscriptions.</p>
<div class="note"><b>Legal &amp; ethical note.</b> The service shares a pooled set of Tidal accounts, circumvents a regional geo-block via a proxy, and resells access to lossless catalogue audio. See <code>docs/LEGAL.md</code>. This document is an engineering reference for maintaining the existing code; it is not an endorsement of the distribution model.</p>

<h2>2 · System architecture</h2>
${archDiagram()}
<p class="muted">Browser/PWA → Caddy (TLS, static, /api proxy) → FastAPI. The API enqueues background work into Redis; the ARQ worker consumes it and writes job state back to Redis. Users/playlists live in SQLite or Postgres; Tidal credentials live in a separate Fernet-encrypted pool DB. The Telegram bot shares the same API and user model.</p>

<h2>3 · Tech stack</h2>
<ul>
  <li><b>Backend:</b> Python 3.12, FastAPI, uvicorn, ARQ + Redis, SQLModel/SQLAlchemy, httpx, pydantic v2, aiogram, mutagen, yt-dlp, demucs+torch, itsdangerous, passlib+jose, cryptography. Managed with <code>uv</code>.</li>
  <li><b>Frontend:</b> React 19, Vite, Zustand, React Router, Tauri v2, Workbox PWA. Tests: vitest + Playwright e2e.</li>
  <li><b>Infra:</b> Docker multi-stage + docker-compose (redis/api/worker/bot/caddy), Caddy reverse proxy, Marzban/Xray VLESS proxy (separate VPS) for geo-block egress, Alembic migrations.</li>
</ul>

<h2>4 · Deployment topology</h2>
<table><thead><tr><th>Service</th><th>Runs</th><th>Ports</th><th>Depends on</th></tr></thead><tbody>
<tr><td class="k">redis</td><td>redis:7-alpine — job state, queue, rate-limit</td><td class="mono">internal</td><td>—</td></tr>
<tr><td class="k">api</td><td>uvicorn FastAPI (--workers 2 --proxy-headers)</td><td class="mono">8000 (internal in prod)</td><td>redis</td></tr>
<tr><td class="k">worker</td><td>ARQ — download_url / analyze_set + cron</td><td class="mono">—</td><td>redis</td></tr>
<tr><td class="k">bot</td><td>aiogram Telegram bot</td><td class="mono">—</td><td>api</td></tr>
<tr><td class="k">caddy</td><td>TLS termination, static dist, /api proxy</td><td class="mono">80, 443</td><td>api</td></tr>
</tbody></table>
<p><b>Request routing:</b> <code>/assets/*</code> → immutable static; <code>/api/stream/*</code> → proxied with gzip off (Range/206 must pass through); <code>/api/*</code> → gzip + proxy to api; everything else → SPA <code>index.html</code>. The dist is built during deploy and served by Caddy from <code>frontend/dist</code>.</p>
<p><b>Geo-block egress:</b> Tidal blocks RU IPs. Circumvention is at the network layer, not in app code (the Tidal httpx client has no proxy argument). A separate VPS runs Marzban over Xray-core with a VLESS-REALITY inbound; the FlacAud host routes Tidal-bound traffic through it. Live Xray config and routing live on the servers, not in the repo.</p>
<p><b>Deploy:</b> CI (ruff+pytest / lint+build+e2e) then CD via SSH: <code>git reset --hard</code>, build dist, <code>docker compose build</code> + <code>up -d</code>, restart caddy/api/bot, health-check <code>/healthz</code>. A manual <code>scripts/deploy_tidal.py</code> mirrors this from a dev machine.</p>

<h2>5 · Data models</h2>
<h3>User (<span class="mono">database/models.py</span>)</h3>
<p class="mono">id · email* · username* · hashed_password · telegram_id* · plan · subscription_expires_at · subscription_cancel_at_period_end · downloads_today · total_downloads · quota_reset_at · karaoke_enabled · dj_enabled · email_verified</p>
<p class="muted">Properties: <code>effective_plan</code> (resolves annual plans + expiry → free when lapsed), <code>daily_limit</code>, <code>can_download</code>. Web and Telegram users share this one model.</p>
<h3>JobStatus (<span class="mono">server/schemas.py</span>, stored in Redis <span class="mono">tidaldl:job:{id}</span>)</h3>
<p class="mono">job_id (uuid4 hex[:16]) · owner_id · job_type · status(queued|running|done|failed|cancelled) · quality · provider · created/updated_at · tracks[TrackProgress{file_token}] · analysis</p>
<h3>TidalAccount (<span class="mono">providers/tidal/pool.py</span>, pool.db)</h3>
<p class="mono">id · label* · refresh_token_enc (Fernet) · country_code · daily_quota · downloads_today · total_downloads · status(active|exhausted|banned) · last_used_at · banned_at · quota_reset_at</p>

<h2>6 · Sequence flows</h2>
${diagramBlock('6.1 Web download pipeline', 'POST /api/jobs → ARQ worker → signed file delivery', diagrams.download)}
${diagramBlock('6.2 Audio streaming + quality probe', 'manifest probe, capped quality, DASH remux cache', diagrams.stream)}
${diagramBlock('6.3 Authentication & tokens', 'JWT access, rotating refresh cookie, 1h media token', diagrams.auth)}
${diagramBlock('6.4 YooKassa payment + webhook', 'create payment → webhook re-verified server-side', diagrams.payment)}
${diagramBlock('6.5 Tidal account pool acquisition', 'LRU + quota + cooldown, token refresh, success/failure reporting', diagrams.pool)}
${diagramBlock('6.6 Player track switch (frontend)', 'the play-initiation path hardened this review', diagrams.player)}

<h2>7 · Feature catalog</h2>
<table><thead><tr><th>Feature</th><th>What it does / where</th></tr></thead><tbody>${featureRows}</tbody></table>

<h2>8 · Frontend architecture</h2>
<p><b>Renderless wiring:</b> <code>PlayerLogic.jsx</code> wraps the app and runs <code>useAppAuth</code>, <code>usePlaybackQuality</code>, <code>usePlayerTransport</code> (→ <code>usePlayerQueue</code> + <code>usePlayerProgressLoop</code> + <code>usePlayerRadio</code>), <code>useSetEmbedController</code>, <code>usePlayerPersistence</code>, <code>usePlayerMediaEffects</code>; it injects all runtime state into the Zustand <code>usePlayerStore</code> so any component subscribes without prop drilling.</p>
<p><b>State:</b> persisted in the store — theme, language, volume, default/auto quality, visualizer. Runtime (not persisted) — currentTrack, playlist, index, isPlaying, progress, isLoading, transport fns, quality probe, overlays. The library/playlists live in <code>LibraryDataContext</code>; guest data and several caches live in <code>localStorage</code> (tidal-* keys) and are merged on login.</p>
<p><b>Audio engine:</b> two physical <code>&lt;audio&gt;</code> slots (main + preload) swapped for gapless handoff; optionally crossfaded (feature-flagged off). The main element is wired into Web Audio (<code>createMediaElementSource</code>) for the visualizer. Play is initiated by a single bounded watchdog in <code>GlobalAudio.jsx</code> gated by the pure <code>shouldStartPlayback</code>.</p>
<p><b>Pages:</b> /search, /recommendations, /genreverse, /library, /playlists, /sync, /analyzer, /set-library, /splitter, /artist/:id, /album/:id, /account; guest: /, /forgot-password, /reset-password, /verify-email, /terms, /privacy, /s/:token.</p>

<h2>9 · API reference (selected)</h2>
<table><thead><tr><th>Method</th><th>Path</th><th>Purpose</th></tr></thead><tbody>${endpointRows}</tbody></table>

<h2>10 · Security model</h2>
<ul>
  <li><b>Access tokens:</b> HS256 JWT (<code>TIDALDLRU_JWT_SECRET</code>), 60 min, no server-side revocation.</li>
  <li><b>Refresh tokens:</b> random, stored hashed, rotated on each use, revoked on logout; HttpOnly <code>SameSite=Lax</code> cookie scoped to /api/auth.</li>
  <li><b>Media/file tokens:</b> itsdangerous <code>URLSafeTimedSerializer</code> (<code>TIDALDLRU_SIGNING_SECRET</code>), short TTL; gate /api/stream and file downloads via <code>?mt=</code>.</li>
  <li><b>Rate limits:</b> Redis sliding-window per IP per path (login, register, forgot-password, search, jobs, AI playlist), with an in-memory fallback.</li>
  <li><b>SSRF:</b> image proxy resolves DNS, blocks private/loopback/link-local, allowlists Tidal CDNs.</li>
  <li><b>Payment webhook:</b> no provider HMAC; defended by mandatory server-side re-fetch of the payment from YooKassa + amount cross-check (body treated as untrusted hint).</li>
  <li><b>Pool secrets:</b> Tidal refresh tokens encrypted at rest with a Fernet key; ops endpoints behind an ops API key.</li>
</ul>

<h2>11 · Environment variables</h2>
<table><thead><tr><th>Variable</th><th>Purpose</th></tr></thead><tbody>${envRows}</tbody></table>

<h2>12 · Known issues &amp; tech debt</h2>
<h3>Fixed in this review pass</h3>
<ul>${fixedRows}</ul>
<h3>Open (prioritized) — not yet fixed</h3>
<table><thead><tr><th>Sev</th><th>Issue &amp; suggested fix</th></tr></thead><tbody>${openRows}</tbody></table>
<div class="note"><b>Deployment boundary:</b> standing up / operating the distribution infrastructure (running the stack live, the account pool, the geo-block proxy, paywall enforcement) is intentionally out of scope for the assistant; this document and the code/security fixes are the supported deliverables.</div>

</div></body></html>`;

const htmlPath = join(DOCS_DIR, 'FlacAud-Service-Documentation.html');
const pdfPath = join(DOCS_DIR, 'FlacAud-Service-Documentation.pdf');
writeFileSync(htmlPath, html, 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', bottom: '14mm', left: '10mm', right: '10mm' },
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate:
    '<div style="width:100%;font-size:8px;color:#9aa6bf;padding:0 12mm;display:flex;justify-content:space-between;">'
    + '<span>FlacAud — Service Documentation</span><span class="pageNumber"></span></div>',
});
await browser.close();
console.log('Wrote', htmlPath);
console.log('Wrote', pdfPath);
