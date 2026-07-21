import { useState } from 'react';
import { HardDrive, Download, Trash2, ChevronDown, ChevronUp, Music } from 'lucide-react';
import {
  clearOfflineCache, listCachedTracks, downloadCachedTrackByKey, removeCachedAudioByKey,
} from '../../utils/cache';
import { showToast } from '../../utils/toast';
import { coverImgSrc } from '../../utils/coverUrl';

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
 * Offline cache stats + clear button, with an expandable list of individually
 * cached tracks (download / remove one at a time).
 * Extracted from Account.jsx.
 */
export default function OfflineCacheCard({ t, isLoggedIn, offlineCacheStats, onCleared }) {
  const [expanded, setExpanded] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  if (!isLoggedIn) return null;

  const toggleExpanded = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    setLoadingList(true);
    try {
      setTracks(await listCachedTracks());
    } finally {
      setLoadingList(false);
    }
  };

  const removeOne = async (row) => {
    await removeCachedAudioByKey(row.cacheKey);
    setTracks((cur) => cur.filter((r) => r.cacheKey !== row.cacheKey));
    await onCleared();
    showToast(t('offlineCacheRemoved'));
  };

  return (
    <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
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
              flexShrink: 0,
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
        <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
          {offlineCacheStats.count > 0 && (
            <button type="button" className="btn-secondary" onClick={toggleExpanded} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {expanded ? t('offlineCacheHide') : t('offlineCacheShow')}
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            disabled={offlineCacheStats.count === 0}
            onClick={async () => {
              await clearOfflineCache();
              setTracks([]);
              setExpanded(false);
              await onCleared();
              showToast(t('offlineCacheCleared'));
            }}
          >
            {t('offlineCacheClear')}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
          {loadingList && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>…</p>
          )}
          {!loadingList && tracks.map((row) => (
            <div
              key={row.cacheKey}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '8px',
                borderRadius: '12px', background: 'var(--bg-surface-hover)',
              }}
            >
              {row.cover_url ? (
                <img src={coverImgSrc(row.cover_url)} alt="" style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Music size={16} color="var(--text-muted)" />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.title || row.provider_id}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {(row.artists || []).join(', ')} · {row.quality} · {formatBytes(row.bytes)}
                </div>
              </div>
              <button
                type="button"
                title={t('offlineCacheDownload')}
                onClick={() => downloadCachedTrackByKey(row.cacheKey, row)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px', flexShrink: 0 }}
              >
                <Download size={16} />
              </button>
              <button
                type="button"
                title={t('offlineCacheRemove')}
                onClick={() => removeOne(row)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px', flexShrink: 0 }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
