import { HardDrive } from 'lucide-react';
import { clearOfflineCache } from '../../utils/cache';
import { showToast } from '../../utils/toast';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Offline cache stats + clear button.
 * Extracted from Account.jsx.
 */
export default function OfflineCacheCard({ t, isLoggedIn, offlineCacheStats, onCleared }) {
  if (!isLoggedIn) return null;

  return (
    <div
      className="glass-panel"
      style={{
        padding: '24px',
        borderRadius: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(33, 150, 243, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#42a5f5',
          }}
        >
          <HardDrive size={24} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{t('offlineCache')}</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('offlineCacheDesc')}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '6px' }}>
            {offlineCacheStats.count > 0
              ? `${offlineCacheStats.count} · ${formatBytes(offlineCacheStats.bytes)}${offlineCacheStats.quota ? ` / ${formatBytes(offlineCacheStats.quota)}` : ''}`
              : t('offlineCacheEmpty')}
          </p>
        </div>
      </div>
      <button
        type="button"
        className="btn-secondary"
        disabled={offlineCacheStats.count === 0}
        onClick={async () => {
          await clearOfflineCache();
          await onCleared();
          showToast(t('offlineCacheCleared'));
        }}
      >
        {t('offlineCacheClear')}
      </button>
    </div>
  );
}
