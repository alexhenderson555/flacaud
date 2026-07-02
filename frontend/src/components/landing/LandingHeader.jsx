import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BRAND_LOGO_SRC } from '../../brand';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

export default function LandingHeader({ t, onToggleLang }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const links = [
    { href: '#features', label: t.navFeatures },
    { href: '#showcase', label: t.navShowcase },
    { href: '#compare', label: t.navCompare },
    { href: '#pricing', label: t.navPricing },
    { href: '#faq', label: t.navFaq },
  ];

  return (
    <header className={`landing__header${scrolled ? ' landing__header--scrolled' : ''}`}>
      <div className="landing__brand">
        <img src={BRAND_LOGO_SRC} alt="FlacAud Logo" className="landing__brand-logo" />
        <span className="landing__brand-text text-gradient">FlacAud</span>
      </div>

      <nav className="landing__nav" aria-label="Landing">
        {links.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
            {l.label}
          </a>
        ))}
      </nav>

      <div className="landing__header-actions">
        <button type="button" className="landing__lang-btn" onClick={onToggleLang} aria-label="Toggle language">
          {t.langToggle}
        </button>
        <Link to="/account" className="landing__header-cta" onClick={() => setMenuOpen(false)}>
          {t.navSignIn}
        </Link>
        <button
          type="button"
          className="landing__menu-btn"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Portal to body: the header's backdrop-filter makes it the containing
          block for position:fixed children, so the drawer would size to the
          header (68px) instead of the viewport and the links would bleed
          over the hero. */}
      {menuOpen && createPortal(
        <div className="landing__mobile-drawer" role="dialog" aria-modal="true">
          <nav className="landing__mobile-nav">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
                {l.label}
              </a>
            ))}
            <Link to="/account" className="landing__mobile-cta" onClick={() => setMenuOpen(false)}>
              {t.navSignIn}
            </Link>
          </nav>
        </div>,
        document.body,
      )}
    </header>
  );
}
