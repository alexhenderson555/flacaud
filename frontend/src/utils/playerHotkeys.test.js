import { describe, expect, it } from 'vitest';
import { hotkeyHintLines, PLAYER_HOTKEYS } from './playerHotkeys';

describe('hotkeyHintLines', () => {
  it('lists every major shortcut including volume and track radio', () => {
    const text = hotkeyHintLines('en').join(' ');
    expect(text).toContain(PLAYER_HOTKEYS.volumeUp);
    expect(text).toContain(PLAYER_HOTKEYS.trackRadio);
    expect(text).toContain(PLAYER_HOTKEYS.shuffle);
    expect(text).toContain(PLAYER_HOTKEYS.cinema);
    expect(hotkeyHintLines('en')).toHaveLength(2);
  });

  it('has Russian labels', () => {
    const lines = hotkeyHintLines('ru');
    expect(lines.join(' ')).toContain('радио по треку');
    expect(lines.join(' ')).toContain('громкость');
  });

  it('lists every shortcut from PLAYER_HOTKEYS', () => {
    const text = hotkeyHintLines('en').join(' ');
    Object.values(PLAYER_HOTKEYS).forEach((key) => {
      const parts = String(key).split('/');
      parts.forEach((part) => {
        expect(text).toContain(part.trim());
      });
    });
  });
});
