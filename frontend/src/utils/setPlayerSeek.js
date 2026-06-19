/** Set embed ref ({ seekTo }) or legacy HTMLMediaElement. */

export function seekSetPlayer(playerApi, seconds) {
  if (!playerApi || !Number.isFinite(seconds)) return false;
  try {
    if (typeof playerApi.seekTo === 'function') {
      return playerApi.seekTo(Math.max(0, seconds));
    }
    playerApi.currentTime = Math.max(0, seconds);
    const playPromise = playerApi.play?.();
    if (playPromise?.catch) playPromise.catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export function seekSetPlayerWithRetry(playerRef, seconds, { maxAttempts = 30, intervalMs = 150 } = {}) {
  if (seekSetPlayer(playerRef?.current, seconds)) return () => {};

  let attempts = 0;
  const id = window.setInterval(() => {
    attempts += 1;
    if (seekSetPlayer(playerRef?.current, seconds) || attempts >= maxAttempts) {
      window.clearInterval(id);
    }
  }, intervalMs);
  return () => window.clearInterval(id);
}
