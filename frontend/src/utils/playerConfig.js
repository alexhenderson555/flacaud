/** Build-time player feature flags (Vite `import.meta.env`). */
function envEnabled(name) {
  const raw = import.meta.env[name];
  return raw === 'true' || raw === '1';
}

/**
 * Crossfade between tracks (dual `<audio>` volume ramp + slot swap).
 * Off in production until stable — enable locally: VITE_PLAYER_CROSSFADE=true
 */
export const FEATURE_CROSSFADE = envEnabled('VITE_PLAYER_CROSSFADE');

/** Crossfade window length when FEATURE_CROSSFADE is on. */
export const CROSSFADE_SEC = FEATURE_CROSSFADE ? 6 : 0;

/** Hidden next-track buffer + slot swap (independent of crossfade). */
export const PRELOAD_ENABLED = true;

/** Gate all crossfade code paths — false unless FEATURE_CROSSFADE. */
export const CROSSFADE_ENABLED = FEATURE_CROSSFADE;
