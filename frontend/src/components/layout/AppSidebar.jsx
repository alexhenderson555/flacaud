import { Link, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, ListMusic, User, Repeat, Radio, Flame, Disc, Library, Menu, X, Heart,
} from 'lucide-react';
import { BRAND_LOGO_SRC, BRAND_NAME } from '../../brand';

function navClass(isActive, extra = '') {
  return ({ isActive }) => (isActive ? `nav-item active ${extra}`.trim() : `nav-item ${extra}`.trim());
}

const MOBILE_MORE_LINKS = [
  { to: '/recommendations', icon: Flame, labelKey: 'recommendations' },
  { to: '/playlists', icon: ListMusic, labelKey: 'playlists' },
  { to: '/sync', icon: Repeat, labelKey: 'transfer' },
  { to: '/analyzer', icon: ListMusic, labelKey: 'setAnalyzer' },
  { to: '/set-library', icon: Library, labelKey: 'setLibrary' },
  { to: '/splitter', icon: Disc, labelKey: 'stemSplitter' },
];

export default function AppSidebar({ t, isMobileMenuOpen, setIsMobileMenuOpen }) {
  const closeMenu = () => setIsMobileMenuOpen(false);

  // Playlists live at /library?tab=playlists (the Playlists route redirects there),
  // so highlight by tab rather than letting both items match the /library pathname.
  const location = useLocation();
  const onLibrary = location.pathname === '/library';
  const libraryTab = new URLSearchParams(location.search).get('tab');
  const libraryActive = onLibrary && libraryTab !== 'playlists';
  const playlistsActive = (onLibrary && libraryTab === 'playlists') || location.pathname === '/playlists';

  return (
    <>
      <nav className="sidebar">
        <Link to="/search" className="brand" style={{ textDecoration: 'none' }}>
          <img
            src={BRAND_LOGO_SRC}
            alt={`${BRAND_NAME} logo`}
            className="brand-logo"
          />
          <h1 className="brand-title">
            <span className="text-gradient">Flac</span>
            <span className="brand-title__suffix">Aud</span>
          </h1>
        </Link>

        <div className="nav-links">
          <div className="sidebar-section-label hide-on-mobile">Discover</div>
          <NavLink to="/search" className={navClass()}>
            <Search size={20} />
            <span>{t('search')}</span>
          </NavLink>
          <NavLink to="/recommendations" className={navClass('', 'hide-on-mobile')}>
            <Flame size={20} />
            <span>{t('recommendations')}</span>
          </NavLink>
          <NavLink to="/genreverse" className={navClass()}>
            <Radio size={20} />
            <span>{t('radio')}</span>
          </NavLink>

          <div className="sidebar-section-label hide-on-mobile">{t('myMusic')}</div>
          <NavLink to="/library" className={() => `nav-item${libraryActive ? ' active' : ''}`}>
            <Heart size={20} />
            <span>{t('library')}</span>
          </NavLink>
          <NavLink to="/library?tab=playlists" className={() => `nav-item hide-on-mobile${playlistsActive ? ' active' : ''}`}>
            <ListMusic size={20} />
            <span>{t('playlists')}</span>
          </NavLink>
          <NavLink to="/sync" className={navClass('', 'hide-on-mobile nav-item-sync')}>
            <Repeat size={20} />
            <span>{t('transfer')}</span>
          </NavLink>

          <div className="sidebar-section-label hide-on-mobile">{t('proTools')}</div>
          <NavLink to="/analyzer" className={navClass('', 'hide-on-mobile')}>
            <ListMusic size={20} />
            <span>{t('setAnalyzer')}</span>
          </NavLink>
          <NavLink to="/set-library" className={navClass('', 'hide-on-mobile')}>
            <Library size={20} />
            <span>{t('setLibrary')}</span>
          </NavLink>
          <NavLink to="/splitter" className={navClass('', 'hide-on-mobile')}>
            <Disc size={20} />
            <span>{t('stemSplitter')}</span>
          </NavLink>

          <NavLink to="/account" className={navClass('', 'nav-item-account mobile-only')}>
            <User size={20} />
            <span>{t('account')}</span>
          </NavLink>

          <div className="nav-item mobile-only" role="button" tabIndex={0} onClick={() => setIsMobileMenuOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsMobileMenuOpen(true); }}>
            <Menu size={20} />
            <span>{t('more')}</span>
          </div>
        </div>

        <div className="sidebar-footer hide-on-mobile">
          <NavLink to="/account" className={navClass('', 'nav-item-account')}>
            <User size={20} />
            <span>{t('account')}</span>
          </NavLink>
        </div>
      </nav>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            className="mobile-menu-overlay mobile-only"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            onClick={closeMenu}
          >
            <div className="mobile-menu-overlay__header" role="button" tabIndex={0} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
              <h2 className="mobile-menu-overlay__title">{t('moreOptions')}</h2>
              <button type="button" className="mobile-menu-overlay__close" onClick={closeMenu} aria-label="Close">
                <X size={22} />
              </button>
            </div>
            <nav className="mobile-menu-grid" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }} aria-label={t('moreOptions')}>
              {MOBILE_MORE_LINKS.map(({ to, icon: Icon, labelKey }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `mobile-menu-grid__item${isActive ? ' active' : ''}`}
                  onClick={closeMenu}
                >
                  <Icon size={22} color="var(--accent-solid)" />
                  <span>{t(labelKey)}</span>
                </NavLink>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
