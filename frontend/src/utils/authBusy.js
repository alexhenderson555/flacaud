/** Pause background API polling while login/register runs (browser connection limit). */
let depth = 0;

export function pauseBackgroundRequests() {
  depth += 1;
}

export function resumeBackgroundRequests() {
  depth = Math.max(0, depth - 1);
}

export function isBackgroundPaused() {
  return depth > 0;
}
