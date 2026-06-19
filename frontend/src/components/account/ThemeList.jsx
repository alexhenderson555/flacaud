import { Check } from 'lucide-react';
import { APP_THEMES, themeLabel, themeModeLabel } from '../../constants/themes';

export default function ThemeList({ theme, setTheme, lang = 'en' }) {
  return (
    <div className="theme-list" role="listbox" aria-label={lang === 'ru' ? 'Тема оформления' : 'Appearance theme'}>
      {APP_THEMES.map((th) => {
        const active = theme === th.id || (theme === 'dark' && th.id === 'default');
        return (
          <button
            key={th.id}
            type="button"
            role="option"
            aria-selected={active}
            className={`theme-list-item${active ? ' theme-list-item--active' : ''}`}
            onClick={() => setTheme(th.id)}
          >
            <span
              className="theme-list-item__dot"
              style={{ background: th.accent }}
              aria-hidden
            />
            <span className="theme-list-item__label">{themeLabel(th, lang)}</span>
            <span
              className={`theme-list-item__tag theme-list-item__tag--${th.light ? 'light' : 'dark'}`}
            >
              {themeModeLabel(th, lang)}
            </span>
            {active && <Check className="theme-list-item__check" size={16} aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
