import {
  Search, Heart, Repeat, ListMusic, Radio, Flame, Library, Compass, User,
} from 'lucide-react';
import { BRAND_LOGO_SRC } from '../../brand';

// Mirrors the real sidebar's groups/order/labels 1:1 (components/layout/AppSidebar.jsx)
// -- this is a marketing mockup, not a live embed, so it drifts whenever the
// real nav changes unless kept in sync by hand.
const NAV = [
  { id: 'search', icon: Search, labelKey: 'search' },
  { id: 'recs', icon: Flame, labelKey: 'recs' },
  { id: 'radio', icon: Radio, labelKey: 'radio' },
  { id: 'library', icon: Heart, labelKey: 'library' },
  { id: 'playlists', icon: ListMusic, labelKey: 'playlists' },
  { id: 'transfer', icon: Repeat, labelKey: 'transfer' },
  { id: 'setBrowser', icon: Compass, labelKey: 'setBrowser' },
  { id: 'sets', icon: Library, labelKey: 'sets' },
  { id: 'analyzer', icon: ListMusic, labelKey: 'analyzer' },
];

const LABELS = {
  en: {
    search: 'Search & Shazam',
    recs: 'Recommendations',
    radio: 'Genreverse',
    library: 'Library',
    playlists: 'Playlists',
    transfer: 'Transfer Library',
    analyzer: 'Set Analyzer',
    sets: 'Set Library',
    setBrowser: 'Set Browser',
    discover: 'Discover',
    myMusic: 'My Music',
    proTools: 'DJ Tools',
    account: 'Account',
  },
  ru: {
    search: 'Поиск и Шазам',
    recs: 'Рекомендации',
    radio: 'Genreverse',
    library: 'Медиатека',
    playlists: 'Плейлисты',
    transfer: 'Перенос музыки',
    analyzer: 'Анализатор сетов',
    sets: 'Библиотека сетов',
    setBrowser: 'Сет Браузер',
    discover: 'Обзор',
    myMusic: 'Моя музыка',
    proTools: 'DJ-инструменты',
    account: 'Профиль',
  },
};

const ROUTES = {
  transfer: '/sync',
  library: '/library',
  dj: '/analyzer',
  search: '/search',
};

export default function LandingProductFrame({
  lang,
  activeRoute = 'transfer',
  children,
  chrome = true,
  className = '',
}) {
  const L = LABELS[lang] || LABELS.en;
  const url = `flacaud.ru${ROUTES[activeRoute] || '/sync'}`;

  return (
    <div className={`landing-product${className ? ` ${className}` : ''}`}>
      <div className="landing-product__glow" aria-hidden />
      <div className="landing-product__shell">
        {chrome && (
          <div className="landing-product__chrome">
            <span className="landing-product__dot" />
            <span className="landing-product__dot" />
            <span className="landing-product__dot" />
            <span className="landing-product__url">{url}</span>
          </div>
        )}
        <div className="landing-product__app">
          <aside className="landing-product__sidebar">
            <div className="landing-product__brand">
              <img src={BRAND_LOGO_SRC} alt="FlacAud logo" className="landing-product__brand-logo" />
              <span>
                <span className="text-gradient">Flac</span>
                Aud
              </span>
            </div>
            <div className="landing-product__nav-group">
              <span className="landing-product__nav-label">{L.discover}</span>
              {NAV.slice(0, 3).map((item) => (
                <NavRow key={item.id} item={item} L={L} active={activeRoute === item.id} />
              ))}
            </div>
            <div className="landing-product__nav-group">
              <span className="landing-product__nav-label">{L.myMusic}</span>
              {NAV.slice(3, 6).map((item) => (
                <NavRow key={item.id} item={item} L={L} active={activeRoute === item.id} />
              ))}
            </div>
            <div className="landing-product__nav-group">
              <span className="landing-product__nav-label">{L.proTools}</span>
              {NAV.slice(6).map((item) => (
                <NavRow
                  key={item.id}
                  item={item}
                  L={L}
                  active={activeRoute === 'dj' && item.id === 'analyzer'}
                />
              ))}
            </div>
            <div className="landing-product__sidebar-foot">
              <User size={14} aria-hidden />
              <span>{L.account}</span>
            </div>
          </aside>
          <div className="landing-product__main">{children}</div>
        </div>
      </div>
    </div>
  );
}

function NavRow({ item, L, active }) {
  const Icon = item.icon;
  return (
    <div className={`landing-product__nav-item${active ? ' landing-product__nav-item--active' : ''}`}>
      <Icon size={14} aria-hidden />
      <span>{L[item.labelKey]}</span>
    </div>
  );
}
