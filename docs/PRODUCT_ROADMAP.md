# FlacAud — product roadmap & agent memory

**Project:** `tidal-dl-ru` · **Prod:** https://flacaud.ru  
**Telegram (sales/support):** https://t.me/alexhenderson (`constants/supportLinks.js`)

Agents: read this before large FlacAud features. Update when scope changes. One item per PR when possible.

---

## P0 — UX / trust / bugs

| ID | Feature | Notes |
|----|---------|-------|
| auth-clarity | **Explicit auth requirement** | Landing + banners: playback/search limits, account required for library/download. No hidden Tidal subscription messaging. |
| mobile-legal | **Terms/Privacy on mobile** | Fixed footer overlapped expanded player; use in-flow footer above player (see `index.css` `.legal-footer`). |
| notif-palette | **OS notification tint from cover** | SoundCloud-style lock screen (Android extracts palette from artwork). Ensure `MediaMetadata` artwork sizes 96–512; optional dynamic `theme-color` in-app. Web cannot fully control Android notification chrome. |
| karaoke-polish | **Karaoke / lyrics screen** | Smoother crossfade between lines; scroll easing; typography; reduce jank on line change (`KaraokeMode.jsx`, `LyricsView.jsx`). |

---

## P1 — DJ (high value for DJs + marketing)

| ID | Feature | Notes |
|----|---------|-------|
| dj-insights-v2 | **Set analyzer DJ insights** | v1 shipped: BPM curve, Camelot chips, transition hint. Extend: per-transition warnings list, analyze-on-open for matched tracks. |
| miq-cues | **Mixed In Key–style cue points** | On waveform/timeline: optimal mix-in/out regions per track; harmonic + BPM compatibility with next track. Needs audio analysis or cached DJ meta + heuristics. Heavy: stem-aware segments. |
| dj-stems-miq | **Stems + transition map** | Combine `StemSplitter` with segment boundaries for mashup/mix points. |
| ai-dj-sets | **AI-generated DJ sets** (vision) | Endgame: generate ideal set order/mix points from library + constraints. Depends on miq-cues + reliable BPM/key. |

---

## P1 — Killer growth features

| ID | Feature | Notes |
|----|---------|-------|
| party-mode | **Party mode (desktop/tablet only)** | Fullscreen rhythm viz; multiple styles; minimal glass controls (title, artist, play/pause, like, next). **Hide on mobile.** Cursor-reactive variants (flee/follow). Picker with **video preview on hover**. Reuse `AudioVisualizer` + WebGL/canvas. |
| party-youtube | **YouTube export pipeline** | Record Party mode (or headless render): **cover + title + artist only** — no transport/like/next. AI-assisted clips for social/YouTube. FFmpeg or browser capture; separate “creator” preset. |
| search-save-playlist | **Save current search results as playlist** | Snapshot all visible search hits into user playlist (paginate if needed). |

---

## P2 — Content & quality

| ID | Feature | Notes |
|----|---------|-------|
| artist-bio-ai | **Artist bio via Gemini** | Replace/fix Wikipedia fallback (`ArtistProfile.jsx`). NTO-style wrong bios = disambiguation failure. Template: music-only, 2–3 sentences, no film/other同名. Store + cache by artist id. |
| hq-outside-catalog | **Higher quality outside catalog** | Research: alternate sources when Tidal max is 320k / no FLAC stream. Legal/ToS sensitive — document before build. |
| monochrome-ref | **Monochrome app reference** | UX benchmark for player, queue, lyrics, TV — note patterns in this file when researched. |

---

## P2 — Platform

| ID | Feature | Notes |
|----|---------|-------|
| tv-nav | **TV / remote navigation** | Focus rings, spatial nav, large targets; `data-tv` or media query `pointer: coarse` + wide screen. No impact on desktop/mobile layouts. |
| security-audit | **Security pass on AI-generated code** | OWASP-style review: auth, SSRF in transfer/analyzer URLs, XSS (`dangerouslySetInnerHTML`, lyrics), SQL, secrets, rate limits. Track in `docs/SECURITY_AUDIT.md`. |

---

## Done / shipped (reference)

- Landing premium (showcase, FAQ, Telegram CTA)
- Postgres prod cutover
- Set DJ insights v1 (`SetDjInsights.jsx`, `setDjInsights.js`)
- Transfer: 8 platforms incl. Tidal playlists (no subscription FAQ on landing)
- `TELEGRAM_CONTACT_URL` shared constant

---

## Implementation notes

### Party mode constraints
- Desktop/tablet: `min-width: 900px` or `pointer: fine` + not `max-touch`
- Mobile: entry hidden in player/command palette
- Performance: one active viz; pause when tab hidden

### Media notification colors
- Pass multiple `artwork` entries in `useMediaSession.js`
- High-res cover URL via `proxiedCoverUrl`
- Android 13+ derives notification color from artwork automatically when metadata is correct

### Artist bio Gemini prompt (draft)
```
You write short artist bios for a music streaming app.
Artist: {name}. Known tracks on service: {top_tracks}.
Rules: 2-3 sentences, English/Russian per locale, ONLY music career and sound.
No actors, no homonyms, no Wikipedia disambiguation noise.
If unsure, say "Electronic producer" level generality instead of guessing.
```

---

*Last updated: 2026-06-15*
