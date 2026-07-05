import { Globe } from 'lucide-react';

/**
 * Language toggle card (EN / RU).
 * Extracted from Account.jsx.
 */
export default function LanguageCard({ t, lang, setLang }) {
  return (
    <div
      className="glass-panel"
      style={{
        padding: '24px',
        borderRadius: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(0, 200, 83, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#00c853',
          }}
        >
          <Globe size={24} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{t('langTitle')}</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('langDesc')}</p>
        </div>
      </div>
      <div style={{ display: 'flex', background: 'var(--bg-surface-hover)', borderRadius: '12px', padding: '4px' }}>
        <button
          type="button"
          onClick={() => setLang('en')}
          style={{
            background: lang === 'en' ? 'var(--accent-solid)' : 'transparent',
            color: lang === 'en' ? 'var(--on-accent)' : 'var(--text-secondary)',
            border: 'none',
            padding: '6px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontWeight: 600,
          }}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => setLang('ru')}
          style={{
            background: lang === 'ru' ? 'var(--accent-solid)' : 'transparent',
            color: lang === 'ru' ? 'var(--on-accent)' : 'var(--text-secondary)',
            border: 'none',
            padding: '6px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontWeight: 600,
          }}
        >
          RU
        </button>
      </div>
    </div>
  );
}
