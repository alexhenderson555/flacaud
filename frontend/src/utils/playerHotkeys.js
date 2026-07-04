/** Single source of truth for player keyboard shortcuts. */

export const PLAYER_HOTKEYS = {
  playPause: 'Space',
  nextTrack: '→',
  prevTrack: '←',
  seekForward: 'Shift+→',
  seekBack: 'Shift+←',
  volumeUp: '↑',
  volumeDown: '↓',
  like: 'L',
  karaoke: 'K',
  queue: 'Q',
  eq: 'E',
  dj: 'D',
  mute: 'M',
  shuffle: 'S',
  repeat: 'R',
  trackRadio: 'T',
  fullscreen: 'F',
  cinema: 'C',
  visual: 'V',
  commandPalette: '/',
  commandPaletteAlt: 'Ctrl+K',
  close: 'Esc',
};

/** Hint rows above the player — keep in sync with usePlayerHotkeys. */
const HINT_ROWS = {
  en: [
    [
      [`${PLAYER_HOTKEYS.playPause}`, 'play'],
      [`${PLAYER_HOTKEYS.prevTrack}/${PLAYER_HOTKEYS.nextTrack}`, 'track'],
      [`${PLAYER_HOTKEYS.seekBack}/${PLAYER_HOTKEYS.seekForward}`, 'seek'],
      [`${PLAYER_HOTKEYS.volumeDown}/${PLAYER_HOTKEYS.volumeUp}`, 'volume'],
      [`${PLAYER_HOTKEYS.mute}`, 'mute'],
      [`${PLAYER_HOTKEYS.shuffle}`, 'shuffle'],
      [`${PLAYER_HOTKEYS.repeat}`, 'repeat'],
    ],
    [
      [`${PLAYER_HOTKEYS.like}`, 'like'],
      [`${PLAYER_HOTKEYS.trackRadio}`, 'track radio'],
      [`${PLAYER_HOTKEYS.karaoke}`, 'karaoke'],
      [`${PLAYER_HOTKEYS.queue}`, 'queue'],
      [`${PLAYER_HOTKEYS.eq}`, 'EQ'],
      [`${PLAYER_HOTKEYS.dj}`, 'DJ'],
      [`${PLAYER_HOTKEYS.fullscreen}`, 'fullscreen'],
      [`${PLAYER_HOTKEYS.cinema}`, 'cinema'],
      [`${PLAYER_HOTKEYS.visual}`, 'visual'],
      [`${PLAYER_HOTKEYS.commandPaletteAlt}`, 'search'],
      [`${PLAYER_HOTKEYS.close}`, 'close'],
    ],
  ],
  ru: [
    [
      [`${PLAYER_HOTKEYS.playPause}`, 'play'],
      [`${PLAYER_HOTKEYS.prevTrack}/${PLAYER_HOTKEYS.nextTrack}`, 'трек'],
      [`${PLAYER_HOTKEYS.seekBack}/${PLAYER_HOTKEYS.seekForward}`, 'перемотка'],
      [`${PLAYER_HOTKEYS.volumeDown}/${PLAYER_HOTKEYS.volumeUp}`, 'громкость'],
      [`${PLAYER_HOTKEYS.mute}`, 'mute'],
      [`${PLAYER_HOTKEYS.shuffle}`, 'shuffle'],
      [`${PLAYER_HOTKEYS.repeat}`, 'repeat'],
    ],
    [
      [`${PLAYER_HOTKEYS.like}`, 'лайк'],
      [`${PLAYER_HOTKEYS.trackRadio}`, 'радио по треку'],
      [`${PLAYER_HOTKEYS.karaoke}`, 'караоке'],
      [`${PLAYER_HOTKEYS.queue}`, 'очередь'],
      [`${PLAYER_HOTKEYS.eq}`, 'EQ'],
      [`${PLAYER_HOTKEYS.dj}`, 'DJ'],
      [`${PLAYER_HOTKEYS.fullscreen}`, 'fullscreen'],
      [`${PLAYER_HOTKEYS.cinema}`, 'кино'],
      [`${PLAYER_HOTKEYS.visual}`, 'анимация'],
      [`${PLAYER_HOTKEYS.commandPaletteAlt}`, 'поиск'],
      [`${PLAYER_HOTKEYS.close}`, 'закрыть'],
    ],
  ],
};

function formatHintRow(entries) {
  return entries.map(([keys, label]) => `${keys} ${label}`).join(' · ');
}

export function hotkeyHintLines(lang = 'en') {
  const rows = HINT_ROWS[lang] || HINT_ROWS.en;
  return rows.map(formatHintRow);
}

export function withHotkey(label, key) {
  return key ? `${label} (${key})` : label;
}
