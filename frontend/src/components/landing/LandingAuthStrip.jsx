import { Link } from 'react-router-dom';
import { LogIn } from 'lucide-react';

export default function LandingAuthStrip({ t }) {
  return (
    <section className="landing-auth-strip glass-panel" aria-label={t.authStripTitle}>
      <LogIn size={20} className="landing-auth-strip__icon" aria-hidden />
      <div className="landing-auth-strip__copy">
        <strong>{t.authStripTitle}</strong>
        <p>{t.authStripBody}</p>
      </div>
      <Link to="/account" className="btn-primary landing-auth-strip__cta">
        {t.authStripCta}
      </Link>
    </section>
  );
}
