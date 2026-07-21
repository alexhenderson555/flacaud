import {
  Search, Heart, Repeat, ListMusic, Radio, Flame, Library, Compass, User,
} from 'lucide-react';
import { BRAND_LOGO_SRC } from '../../brand';

const NAV = [
  { id: 'search', icon: Search, labelKey: 'search' },
  { id: 'recs', icon: Flame, labelKey: 'recs' },
  { id: 'vibe', icon: Radio, labelKey: 'vibe' },
  { id: 'setBrowser', icon: Compass, labelKey: 'setBrowser' },
  { id: 'library', icon: Heart, labelKey: 'library' },
  { id: 'transfer', icon: Repeat, labelKey: 'transfer' },
  { id: 'analyzer', icon: ListMusic, labelKey: 'analyzer' },
  { id: 'sets', icon: Library, labelKey: 'sets' },
];

const LABELS = {
  en: {
    search: 'Search & Shazam',
    recs: 'Recommendations',
    vibe: 'My Vibe',
    library: 'Library',
    transfer: 'Transfer Library',
    analyzer: 'Set Analyzer',
    sets: 'Set Library',
    setBrowser: 'Set Browser',
    discover: 'Discover',
    myMusic: 'My music',
    proTools: 'Pro tools',
    account: 'Account',
  },
  ru: {
    search: 'Поиск и Shazam',
    recs: 'Рекомендации',
    vibe: 'Мой вайб',
    library: 'Медиатека',
    transfer: 'Перенос медиатеки',
    analyzer: 'Анализ сета',
    sets: 'Библиотека сетов',
    setBrowser: 'Сет Браузер',
    discover: 'Обзор',
    myMusic: 'Моя музыка',
    proTools: 'Инструменты',
    account: 'Аккаунт',
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
              {NAV.slice(3, 5).map((item) => (
                <NavRow key={item.id} item={item} L={L} active={activeRoute === item.id} />
              ))}
            </div>
            <div className="landing-product__nav-group">
              <span className="landing-product__nav-label">{L.proTools}</span>
              {NAV.slice(5).map((item) => (
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
