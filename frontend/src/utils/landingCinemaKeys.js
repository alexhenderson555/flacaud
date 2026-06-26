/** Physical key position — works on any keyboard layout (RU, EN, …). */

export function isLandingCinemaToggleKey(event) {
  return (
    event.code === 'KeyV'
    && event.shiftKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && !event.repeat
  );
}

export function isTypingTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(target.isContentEditable);
}
