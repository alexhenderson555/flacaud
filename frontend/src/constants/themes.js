/** App color themes — `id` is stored in localStorage (`tidal-theme`) and set on `data-theme`. */

export const APP_THEMES = [
  { id: 'default', nameEn: 'Midnight blue', nameRu: 'Синяя ночь', accent: '#2575fc', light: false },
  { id: 'ocean', nameEn: 'Ocean', nameRu: 'Океан', accent: '#00b4d8', light: false },
  { id: 'purple', nameEn: 'Purple', nameRu: 'Пурпур', accent: '#9d4edd', light: false },
  { id: 'crimson', nameEn: 'Crimson', nameRu: 'Багровый', accent: '#e63946', light: false },
  { id: 'emerald', nameEn: 'Emerald', nameRu: 'Изумруд', accent: '#2a9d8f', light: false },
  { id: 'midnight', nameEn: 'Charcoal', nameRu: 'Графит', accent: '#818cf8', light: false },
  { id: 'amber', nameEn: 'Amber night', nameRu: 'Янтарная ночь', accent: '#f59e0b', light: false },
  { id: 'snow', nameEn: 'Snow', nameRu: 'Снег', accent: '#2563eb', light: true },
  { id: 'cream', nameEn: 'Cream', nameRu: 'Крем', accent: '#d97706', light: true },
  { id: 'sky', nameEn: 'Day sky', nameRu: 'Небо', accent: '#0284c7', light: true },
];

const LEGACY_THEME_IDS = { dark: 'default' };

export function normalizeThemeId(id) {
  if (!id) return 'default';
  return LEGACY_THEME_IDS[id] || id;
}

export function themeLabel(theme, lang = 'en') {
  if (!theme) return '';
  return lang === 'ru' ? theme.nameRu : theme.nameEn;
}

export function themeModeLabel(theme, lang = 'en') {
  if (!theme) return '';
  if (theme.light) return lang === 'ru' ? 'светлая' : 'light';
  return lang === 'ru' ? 'тёмная' : 'dark';
}

export function findTheme(id) {
  const norm = normalizeThemeId(id);
  return APP_THEMES.find((t) => t.id === norm) || APP_THEMES[0];
}
