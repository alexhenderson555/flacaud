import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, CheckCircle2, X, AlertCircle, RotateCcw } from 'lucide-react';
import { getCachedAudioUrl } from '../utils/cache';
import { getMediaToken } from '../utils/mediaToken';
import { removeDownloadJob, retryDownloadJob, isSessionJob, wasJobSaved, markJobSaved } from '../utils/downloadJobs';
import { isBackgroundPaused } from '../utils/authBusy';

const STUCK_MS = 8 * 60 * 1000;
const DONE_HIDE_MS = 6000;
const POLL_ACTIVE_MS = 2000;
const POLL_IDLE_MS = 8000;

function jobsSnapshotEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.id !== y.id || x.progress !== y.progress || x.status !== y.status || x.failed !== y.failed) return false;
  }
  return true;
}

export default function DownloadToast() {
  const [activeJobs, setActiveJobs] = useState([]);
  const [browserProgressMap, setBrowserProgressMap] = useState({});
  const autoDownloadedRef = useRef(new Set());
  const browserProgressRef = useRef({});
  const hideAfterRef = useRef({});
  const progressHistoryRef = useRef({});
  const dismissedRef = useRef(new Set());
  const activeJobsRef = useRef([]);
  const pollDelayRef = useRef(POLL_IDLE_MS);

  const setBrowserProgress = useCallback((jobId, value) => {
    browserProgressRef.current[jobId] = value;
    setBrowserProgressMap({ ...browserProgressRef.current });
    if (value === 100) {
      hideAfterRef.current[jobId] = Date.now() + 4000;
    }
  }, []);

  const dismissJob = useCallback((jobId) => {
    dismissedRef.current.add(jobId);
    removeDownloadJob(jobId);
    delete browserProgressRef.current[jobId];
    delete hideAfterRef.current[jobId];
    delete progressHistoryRef.current[jobId];
    setActiveJobs((prev) => {
      const next = prev.filter((j) => j.id !== jobId);
      activeJobsRef.current = next;
      return next;
    });
    setBrowserProgressMap({ ...browserProgressRef.current });
  }, []);

  const handleSaveToPC = async (job) => {
    let url = null;
    if (job.file_token) {
      url = `/api/files/${job.file_token}`;
    } else if (job.provider_id) {
      url = await getCachedAudioUrl({ provider: job.provider, provider_id: job.provider_id }, job.quality);
      if (!url) {
        url = `/api/stream/${job.provider}/${job.provider_id}?quality=${job.quality}&mt=${await getMediaToken()}`;
      }
    }

    if (!url) return;
    if (window.__TAURI__ && url.startsWith('/api')) {
      url = 'http://localhost:8000' + url;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Network response was not ok');

      const contentLength = response.headers.get('content-length');
      const total = parseInt(contentLength, 10);
      let loaded = 0;

      const reader = response.body.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (total) {
          setBrowserProgress(job.id, Math.round((loaded / total) * 100));
        } else {
          setBrowserProgress(job.id, Math.min(95, Math.round(loaded / 500000)));
        }
      }

      setBrowserProgress(job.id, 100);

      const blob = new Blob(chunks);
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const cd = response.headers.get('content-disposition');
      let ext = 'flac';
      if (cd && cd.includes('filename=')) {
        const filename = cd.split('filename=')[1].replace(/['"]/g, '');
        if (filename.includes('.')) {
          ext = filename.split('.').pop();
        }
      } else {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('mp4')) ext = 'mp4';
        if (ct.includes('m4a') || ct.includes('aac')) ext = 'm4a';
        if (ct.includes('mpeg')) ext = 'mp3';
      }

      a.download = `${job.title}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error('Download failed:', e);
      setBrowserProgress(job.id, -1);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let timerId;

    const schedule = (delay) => {
      pollDelayRef.current = delay;
      clearTimeout(timerId);
      timerId = setTimeout(() => { fetchJobs(); }, delay);
    };

    const fetchJobs = async () => {
      if (cancelled) return;
      if (!localStorage.getItem('tidal-token')) {
        schedule(60_000);
        return;
      }
      if (document.visibilityState === 'hidden' || isBackgroundPaused()) {
        schedule(isBackgroundPaused() ? 15_000 : 60_000);
        return;
      }
      const saved = localStorage.getItem('tidal-queue-jobs');
      if (!saved) {
        if (activeJobsRef.current.length) {
          activeJobsRef.current = [];
          setActiveJobs([]);
        }
        schedule(POLL_IDLE_MS);
        return;
      }
      try {
        const jobIds = JSON.parse(saved).filter((id) => !dismissedRef.current.has(id));
        if (jobIds.length === 0) {
          if (activeJobsRef.current.length) {
            activeJobsRef.current = [];
            setActiveJobs([]);
          }
          schedule(POLL_IDLE_MS);
          return;
        }

        const token = localStorage.getItem('tidal-token') || '';
        const results = await Promise.all(
          jobIds.map((id) =>
            fetch(`/api/jobs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          )
        );

        const now = Date.now();
        const newItems = [];
        const keepIds = [];

        results.forEach((job) => {
          if (!job) return;
          if (job.job_type === 'analyze_set') return;
          if (dismissedRef.current.has(job.job_id)) return;

          keepIds.push(job.job_id);

          const trackProgress = job.tracks && job.tracks[0];
          const isDone = job.status === 'done' || (trackProgress && trackProgress.status === 'done');
          let isFailed = job.status === 'failed' || (trackProgress && trackProgress.status === 'failed');

          let progress = 0;
          if (trackProgress?.bytes_total && trackProgress.bytes_total > 0) {
            progress = Math.min(99, Math.round((trackProgress.bytes_written / trackProgress.bytes_total) * 100));
          } else if (job.status === 'running') {
            progress = trackProgress?.bytes_written ? Math.min(30, 5 + Math.floor(trackProgress.bytes_written / 500000)) : 2;
          }
          if (isDone) progress = 100;

          const hist = progressHistoryRef.current[job.job_id] || { progress: 0, at: now };
          if (progress !== hist.progress) {
            progressHistoryRef.current[job.job_id] = { progress, at: now };
          } else if (job.status === 'running' && !isDone && now - hist.at > STUCK_MS) {
            isFailed = true;
          }

          const jobObj = {
            id: job.job_id,
            title: trackProgress?.title || (job.total_tracks > 1 ? `Download (${job.done_tracks}/${job.total_tracks})` : 'Downloading…'),
            progress,
            status: job.status,
            failed: isFailed,
            error: trackProgress?.error || (isFailed ? 'Download stalled or failed' : null),
            provider_id: trackProgress?.provider_id || null,
            file_token: trackProgress?.file_token || null,
            provider: job.provider || 'tidal',
            quality: job.quality || 'LOSSLESS',
            url: trackProgress?.source_url || null,
          };

          // Auto-save to PC only for downloads started in THIS browser session, and
          // never the same job twice (persisted across reloads/logins). Without this,
          // every finished job still in the queue re-downloaded on the next login —
          // the "all my earlier downloads replay before login" race.
          if (
            isDone &&
            jobObj.file_token &&
            !autoDownloadedRef.current.has(job.job_id) &&
            !window.__E2E_DISABLE_AUTOSAVE__ &&
            isSessionJob(job.job_id) &&
            !wasJobSaved(job.job_id)
          ) {
            autoDownloadedRef.current.add(job.job_id);
            markJobSaved(job.job_id);
            setBrowserProgress(job.job_id, 0);
            handleSaveToPC(jobObj);
          }

          if (isDone && !hideAfterRef.current[job.job_id]) {
            hideAfterRef.current[job.job_id] = now + DONE_HIDE_MS;
          }

          const bp = browserProgressRef.current[job.job_id];
          const hideAfter = hideAfterRef.current[job.job_id];
          const visible =
            !dismissedRef.current.has(job.job_id) &&
            (isFailed ||
              progress < 100 ||
              bp === -1 ||
              (bp !== undefined && bp >= 0 && bp < 100) ||
              (bp === 100 && hideAfter && now < hideAfter) ||
              (isDone && hideAfter && now < hideAfter));

          if (visible) {
            newItems.push(jobObj);
          } else {
            const idx = keepIds.indexOf(job.job_id);
            if (idx !== -1) keepIds.splice(idx, 1);
          }
        });

        if (keepIds.length !== jobIds.length) {
          localStorage.setItem('tidal-queue-jobs', JSON.stringify(keepIds));
        }

        if (!jobsSnapshotEqual(activeJobsRef.current, newItems)) {
          activeJobsRef.current = newItems;
          setActiveJobs(newItems);
        }

        const hasRunning = newItems.some((j) => !j.failed && j.progress < 100);
        schedule(hasRunning ? POLL_ACTIVE_MS : POLL_IDLE_MS);
      } catch (err) {
        console.error(err);
        schedule(POLL_IDLE_MS);
      }
    };

    fetchJobs();
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [setBrowserProgress]);

  const handleRetry = async (job) => {
    dismissJob(job.id);
    try {
      await retryDownloadJob(job);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="download-toast-stack" aria-live="polite">
      <AnimatePresence mode="popLayout">
        {activeJobs.map((job) => {
          const bp = browserProgressMap[job.id];
          const isFailed = job.failed || bp === -1;
          const isComplete = job.progress === 100 && !isFailed;
          const barPct = job.progress < 100
            ? Math.max(job.progress, job.status === 'running' ? 2 : 0)
            : (bp !== undefined && bp >= 0 ? bp : 100);

          return (
            <motion.div
              key={job.id}
              data-testid="download-toast"
              data-job-id={job.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
              className="glass-panel"
              style={{ padding: '16px', borderRadius: '16px', width: '300px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--border-subtle)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: isFailed ? 'rgba(239,68,68,0.15)' : isComplete ? 'rgba(16, 185, 129, 0.1)' : 'rgba(37, 117, 252, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isFailed ? '#ef4444' : isComplete ? 'var(--success)' : 'var(--accent-solid)' }}>
                    {isFailed ? <AlertCircle size={20} /> : isComplete ? <CheckCircle2 size={20} /> : <Download size={20} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{job.title}</div>
                    <div data-testid="download-toast-status" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {isFailed
                        ? (job.error || 'Download failed')
                        : isComplete
                          ? (bp !== undefined && bp >= 0 ? (bp === 100 ? 'Saved to PC' : `Saving to PC… ${bp}%`) : 'Ready on server')
                          : job.status === 'queued'
                            ? 'Preparing…'
                            : `Downloading… ${job.progress}%`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
                  {isFailed && (
                    <button type="button" data-testid="download-retry-btn" onClick={() => handleRetry(job)} title="Retry" style={{ background: 'transparent', border: 'none', color: 'var(--accent-solid)', cursor: 'pointer', padding: '4px' }}>
                      <RotateCcw size={16} />
                    </button>
                  )}
                  <button type="button" data-testid="download-dismiss-btn" onClick={(e) => { e.stopPropagation(); dismissJob(job.id); }} title="Dismiss" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
                    <X size={16} />
                  </button>
                </div>
              </div>

              {!isFailed && (job.progress < 100 || (bp !== undefined && bp >= 0 && bp <= 100)) && (
                <div data-testid="download-toast-progress-track" style={{ width: '100%', height: '4px', background: 'var(--bg-surface-hover)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div
                    data-testid="download-toast-progress-bar"
                    style={{ height: '100%', width: `${Math.min(100, barPct)}%`, background: isComplete ? 'var(--success)' : 'var(--accent-gradient)', transition: 'width 0.3s ease' }}
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
