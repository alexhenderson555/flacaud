# FlacAud frontend design tokens

## Theme variables (`index.css`)

| Token | Usage |
|-------|--------|
| `--accent-solid` | Primary actions, active track, badge text |
| `--accent-glow` | Play button glow, badge shadows |
| `--accent-gradient` | Primary buttons, hero CTAs |
| `--bg-surface` | Glass panels, cards |
| `--bg-surface-hover` | Row hover, muted badges |
| `--border-subtle` | Panel borders |
| `--text-secondary` / `--text-muted` | Subtitles, pending labels |

## Components

### `MetaBadge`

Variants: **`solid`** (player MAX/year), **`soft`** (default BPM/key), **`muted`** (secondary tags).

### Track list rows

Use shared classes from `index.css`:

- **`track-row`** — flex row with hover
- **`track-row__cover`**, **`track-row__meta`**, **`track-row__title`**, **`track-row__artist`**, **`track-row__actions`**

Playlist JSON tracks: **`mapPlaylistTrack()`** in `trackNormalize.js` (fills `artist_ids`, `album_id`). API saves: **`tracksForPlaylistApi()`** in `playlistApi.js`.

### `TrackRow`

Reusable row for Library (`variant="library"`), Search, Recommendations (`variant="compact"`). Action buttons use **`track-row__icon-btn`**.

### Search typo hints

- **`searchTypoSuggest.js`** — Damerau–Levenshtein + keyboard layout (`searchQueryFix.js`).
- **`searchVocabulary.js`** — seed artists + learned terms in `localStorage`.
- **`SearchDidYouMean`** — chip under the search field and in empty results.
- API: empty search may return **`suggested_query`** / **`suggestion_kind`** (`server/search_typo.py`).

### `TrackDjMeta`

Row-level BPM + Camelot. Props: `track`, optional `getFeatures`, `pendingLabel`, `className` (`track-dj-meta--compact` in queue).

### `BpmRangeSlider` / `CamelotWheel`

Library DJ filters only. Range defaults 60–200 BPM; “active” when narrowed via `djFilters.isBpmFilterActive`.

## DJ data flow

1. `trackFeatures.js` — localStorage cache + optional server `PATCH /api/library/{id}/dj`.
2. `useTrackFeaturesForList` — background preview analysis (logged-in stream).
3. Filters use `djFilters.trackMatchesDjFilters` — pending tracks stay visible until BPM/key known.

## Copy

UI strings: `locales/appDict.js` (`lib*` keys). Search page keeps a local dict but mirrors the same tooltip keys.
