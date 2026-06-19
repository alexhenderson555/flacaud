import { Link } from 'react-router-dom';
import { getLegal } from '../content/legalContent';

export default function LegalPage({ kind }) {
  const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('tidal-lang') || 'en').startsWith('ru') ? 'ru' : 'en';
  const isPrivacy = kind === 'privacy';
  const title = getLegal(lang, isPrivacy ? 'privacyTitle' : 'termsTitle');
  const body = getLegal(lang, isPrivacy ? 'privacy' : 'terms');

  return (
    <div className="page-shell" style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 16px 48px' }}>
      <h1 className="page-header__title" style={{ marginBottom: '16px' }}>{title}</h1>
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          borderRadius: '16px',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
          fontSize: '0.95rem',
        }}
      >
        {body}
      </div>
      <p style={{ marginTop: '24px' }}>
        <Link to="/account" style={{ color: 'var(--accent-solid)' }}>
          {lang === 'ru' ? '← Назад в аккаунт' : '← Back to account'}
        </Link>
      </p>
    </div>
  );
}
