import { History } from 'lucide-react';

/**
 * Download history entry card (clickable to open the history modal).
 * Extracted from Account.jsx.
 */
export default function DownloadHistoryCard({ t, isLoggedIn, onOpen }) {
  return (
    <div
      className="glass-panel account-card--clickable"
      role="button"
      tabIndex={0}
      onClick={() => isLoggedIn && onOpen()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && isLoggedIn) onOpen();
      }}
      style={{ opacity: isLoggedIn ? 1 : 0.5, cursor: isLoggedIn ? 'pointer' : 'not-allowed' }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: 'rgba(255, 179, 0, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--warning)',
        }}
      >
        <History size={24} />
      </div>
      <div>
        <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{t('dlHistory')}</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('dlDesc')}</p>
      </div>
    </div>
  );
}
