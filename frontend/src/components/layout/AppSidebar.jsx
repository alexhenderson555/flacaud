import { Link, NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, ListMusic, User, Waves, Repeat, Radio, Flame, Disc, Heart, Menu, X,
} from 'lucide-react';

export default function AppSidebar({ t, isMobileMenuOpen, setIsMobileMenuOpen }) {
  return (
    <>
      <nav className="sidebar">
        <Link to="/search" className="brand" style={{ textDecoration: 'none' }}>
          <img
            src="/logo.png"
            alt="FlacAudio"
            style={{ width: '32px', height: '32px', borderRadius: '8px' }}
            onError={(e) => {
              e.target.style.display = 'none';
              if (e.target.nextSibling) e.target.nextSibling.style.display = 'block';
            }}
          />
          <Waves size={28} color="var(--accent-solid)" style={{ display: 'none' }} />
          <h1><span className="text-gradient">Flac</span>Audio</h1>
        </Link>

        <div className="nav-links">
          <div className="hide-on-mobile" style={{ padding: '0 16px', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', marginTop: '16px' }}>Discover</div>
          <NavLink to="/search" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            <Search size={20} />
            <span>{t('search')}</span>
          </NavLink>
          <NavLink to="/recommendations" className={({ isActive }) => (isActive ? 'nav-item active hide-on-mobile' : 'nav-item hide-on-mobile')}>
            <Flame size={20} />
            <span>{t('recommendations')}</span>
          </NavLink>
          <NavLink to="/radio" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            <Radio size={20} />
            <span>{t('radio')}</span>
          </NavLink>

          <div className="hide-on-mobile" style={{ padding: '0 16px', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', marginTop: '24px' }}>{t('myMusic')}</div>
          <NavLink to="/library" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            <Heart size={20} />
            <span>{t('library')}</span>
          </NavLink>
          <NavLink to="/playlists" className={({ isActive }) => (isActive ? 'nav-item active hide-on-mobile' : 'nav-item hide-on-mobile')}>
            <ListMusic size={20} />
            <span>{t('playlists')}</span>
          </NavLink>
          <NavLink to="/sync" className={({ isActive }) => (isActive ? 'nav-item active nav-item-sync hide-on-mobile' : 'nav-item hide-on-mobile')}>
            <Repeat size={20} />
            <span>{t('transfer')}</span>
          </NavLink>

          <div className="hide-on-mobile" style={{ padding: '0 16px', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', marginTop: '24px' }}>{t('proTools')}</div>
          <NavLink to="/analyzer" className={({ isActive }) => (isActive ? 'nav-item active hide-on-mobile' : 'nav-item hide-on-mobile')}>
            <ListMusic size={20} />
            <span>{t('setAnalyzer')}</span>
          </NavLink>
          <NavLink to="/splitter" className={({ isActive }) => (isActive ? 'nav-item active hide-on-mobile' : 'nav-item hide-on-mobile')}>
            <Disc size={20} />
            <span>{t('stemSplitter')}</span>
          </NavLink>
          <NavLink to="/account" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            <User size={20} />
            <span>{t('account')}</span>
          </NavLink>
          <div className="nav-item mobile-only" onClick={() => setIsMobileMenuOpen(true)}>
            <Menu size={20} />
            <span>{t('more')}</span>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            className="mobile-menu-overlay mobile-only"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            onClick={() => setIsMobileMenuOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(10, 10, 16, 0.95)',
              backdropFilter: 'blur(20px)',
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              padding: '40px 24px',
            }}
          >
            <div style={{ alignSelf: 'flex-end', marginBottom: '30px' }}>
              <button type="button" onClick={() => setIsMobileMenuOpen(false)} style={{ color: '#fff', background: 'rgba(255,255,255,0.1)', padding: '12px', borderRadius: '50%' }}>
                <X size={24} />
              </button>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '30px', color: 'var(--text-primary)' }}>{t('moreOptions')}</div>
            <div className="mobile-menu-content" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <NavLink to="/sync" className="nav-item" onClick={() => setIsMobileMenuOpen(false)} style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', flexDirection: 'row', justifyContent: 'flex-start' }}>
                <Repeat size={24} />
                <span style={{ fontSize: '1.1rem', marginLeft: '16px', fontWeight: 500 }}>{t('transfer')}</span>
              </NavLink>
              <NavLink to="/playlists" className="nav-item" onClick={() => setIsMobileMenuOpen(false)} style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', flexDirection: 'row', justifyContent: 'flex-start' }}>
                <ListMusic size={24} />
                <span style={{ fontSize: '1.1rem', marginLeft: '16px', fontWeight: 500 }}>{t('playlists')}</span>
              </NavLink>
              <NavLink to="/recommendations" className="nav-item" onClick={() => setIsMobileMenuOpen(false)} style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', flexDirection: 'row', justifyContent: 'flex-start' }}>
                <Flame size={24} />
                <span style={{ fontSize: '1.1rem', marginLeft: '16px', fontWeight: 500 }}>{t('recommendations')}</span>
              </NavLink>
              <NavLink to="/splitter" className="nav-item" onClick={() => setIsMobileMenuOpen(false)} style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', flexDirection: 'row', justifyContent: 'flex-start' }}>
                <Disc size={24} />
                <span style={{ fontSize: '1.1rem', marginLeft: '16px', fontWeight: 500 }}>{t('stemSplitter')}</span>
              </NavLink>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
