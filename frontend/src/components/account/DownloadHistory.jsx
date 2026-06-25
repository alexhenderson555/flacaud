import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Package, Download } from 'lucide-react';
import { apiFetch, parseJsonSafe } from '../../utils/apiClient';
import { qualityButtonLabel } from '../../utils/qualityPrefs';
import { extensionFromResponse } from '../../utils/downloadFormat';
import { fetchJobStatus } from '../../utils/downloadJobs';

function formatWhen(ts, lang) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function safeFilename(title) {
  return String(title || 'track')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()
    .slice(0, 120) || 'track';
}

const copy = {
  en: {
    title: 'Download history',
    empty: 'No completed downloads yet.',
    close: 'Close',
    zip: 'Download ZIP',
    file: 'Download file',
    tracks: 'tracks',
    failed: 'Failed',
    done: 'Done',
    running: 'In progress',
    queued: 'Queued',
    fileUnavailable: 'File link expired — download the track again',
  },
  ru: {
    title: 'История скачиваний',
    empty: 'Пока нет завершённых загрузок.',
    close: 'Закрыть',
    zip: 'Скачать ZIP',
    file: 'Скачать файл',
    tracks: 'треков',
    failed: 'Ошибка',
    done: 'Готово',
    running: 'В процессе',
    queued: 'Queued',
    fileUnavailable: 'Ссылка устарела — скачайте трек заново',
  },
};

export default function DownloadHistory({ open, onClose, lang, isLoggedIn }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const t = (k) => copy[lang]?.[k] || copy.en[k];

  const load = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/jobs/mine?limit=40', { auth: true });
      if (res.ok) {
        const data = await parseJsonSafe(res);
        setItems(Array.isArray(data) ? data : []);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  const resolveFileToken = useCallback(async (job) => {
    if (job.file_token) return job.file_token;
    const full = await fetchJobStatus(job.job_id, lang);
    const track = full?.tracks?.find((tr) => tr.status === 'done' && tr.file_token);
    return track?.file_token || null;
  }, [lang]);

  const downloadZip = useCallback(async (job) => {
    setDownloadingId(job.job_id);
    try {
      const res = await apiFetch(`/api/jobs/${job.job_id}/zip`, { auth: true });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flacaud-${job.job_id}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  }, []);

  const downloadFile = useCallback(async (job) => {
    setDownloadingId(job.job_id);
    try {
      const token = await resolveFileToken(job);
      if (!token) {
        window.alert(t('fileUnavailable'));
        return;
      }
      const res = await apiFetch(`/api/files/${token}`, { auth: true, timeoutMs: 120000, retries: 0 });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const ext = extensionFromResponse(
        res.headers.get('content-disposition'),
        res.headers.get('content-type'),
      );
      const title = job.track_titles?.[0] || 'track';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeFilename(title)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.alert(t('fileUnavailable'));
    } finally {
      setDownloadingId(null);
    }
  }, [lang, resolveFileToken, t]);

  const statusLabel = (status) => {
    if (status === 'done') return t('done');
    if (status === 'failed') return t('failed');
    if (status === 'running') return t('running');
    return t('queued');
  };

  useEffect(() => {
    if (!open || !isLoggedIn) return;
    load();
  }, [open, isLoggedIn, load]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="glass-panel download-history-panel"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-labelledby="download-history-title"
        >
          <div className="download-history-panel__head">
            <h2 id="download-history-title">{t('title')}</h2>
            <button type="button" className="track-row__icon-btn track-row__icon-btn--ghost" onClick={onClose} aria-label={t('close')}>
              <X size={22} />
            </button>
          </div>

          {loading ? (
            <div className="download-history-panel__empty">
              <Loader2 size={32} className="spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="download-history-panel__empty">{t('empty')}</p>
          ) : (
            <ul className="download-history-list">
              {items.map((job) => {
                const isPlaylist = job.total_tracks > 1;
                const busy = downloadingId === job.job_id;
                return (
                  <li key={job.job_id} className="download-history-item">
                    <div className="download-history-item__meta">
                      <span className={`download-history-item__status download-history-item__status--${job.status}`}>
                        {statusLabel(job.status)}
                      </span>
                      <span className="download-history-item__date">{formatWhen(job.updated_at, lang)}</span>
                      {job.quality && (
                        <span className="download-history-item__quality">
                          {qualityButtonLabel(job.quality, lang)}
                        </span>
                      )}
                    </div>
                    <div className="download-history-item__titles">
                      {job.track_titles?.length
                        ? job.track_titles.join(' · ')
                        : `${job.done_tracks || 0} ${t('tracks')}`}
                    </div>
                    {job.status === 'done' && isPlaylist && (
                      <button
                        type="button"
                        className="btn-secondary download-history-item__zip"
                        disabled={busy}
                        onClick={() => downloadZip(job)}
                      >
                        {busy ? <Loader2 size={16} className="spin" /> : <Package size={16} />}
                        {' '}
                        {t('zip')}
                      </button>
                    )}
                    {job.status === 'done' && !isPlaylist && (
                      <button
                        type="button"
                        className="btn-secondary download-history-item__zip"
                        disabled={busy}
                        onClick={() => downloadFile(job)}
                      >
                        {busy ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
                        {' '}
                        {t('file')}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
