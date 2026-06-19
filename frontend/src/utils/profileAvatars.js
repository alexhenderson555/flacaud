/** Emoji avatars cycled in Account settings — reused for artists without photos. */
export const PROFILE_EMOJIS = ['😎', '👽', '🦊', '🎧', '🚀', '👾', '🔥', '🥷'];

export function emojiAvatarForId(id) {
  const s = String(id ?? '0');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0;
  }
  return PROFILE_EMOJIS[h % PROFILE_EMOJIS.length];
}
