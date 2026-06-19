import { describe, it, expect } from 'vitest';
import { APP_THEMES, normalizeThemeId, findTheme, themeModeLabel } from './themes.js';

describe('themes', () => {
  it('has ten themes including light variants', () => {
    expect(APP_THEMES).toHaveLength(10);
    expect(APP_THEMES.filter((t) => t.light)).toHaveLength(3);
  });

  it('maps legacy dark id to default', () => {
    expect(normalizeThemeId('dark')).toBe('default');
    expect(findTheme('dark').id).toBe('default');
  });

  it('labels theme mode dark or light', () => {
    expect(themeModeLabel(APP_THEMES[0], 'en')).toBe('dark');
    expect(themeModeLabel(APP_THEMES[7], 'ru')).toBe('светлая');
  });
});
