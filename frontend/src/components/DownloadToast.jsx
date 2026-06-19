import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, CheckCircle2, X, AlertCircle, RotateCcw } from 'lucide-react';
import { getCachedAudioUrl } from '../utils/cache';
import { getMediaToken } from '../utils/mediaToken';
import { hasAuthSession } from '../utils/hasAuthSession';
import {
  removeDownloadJob,
  retryDownloadJob,
  isSessionJob,
  wasJobSaved,
  markJobSaved,
  DOWNLOAD_JOB_STARTED,
  requestDownloadRegistryRefresh,
  fetchJobStatus,
} from '../utils/downloadJobs';
import { isBackgroundPaused } from '../utils/authBusy';
import { appDict } from '../locales/appDict';
import { computeDownloadToastView, jobStillActive, willAutoSaveToPc } from '../utils/downloadToastStatus';
import { extensionFromResponse } from '../utils/downloadFormat';

const STUCK_MS = 8 * 60 * 1000;
const DONE_HIDE_MS = 5000;
const POLL_ACTIVE_MS = 1000;
const POLL_IDLE_MS = 8000;

function computeServerProgress(job, trackProgress, isDone) {
  if (isDone) return 100;
  if (trackProgress?.bytes_total && trackProgress.bytes_total > 0) {
    return Math.min(
      100,
      Math.max(0, Math.round((trackProgress.bytes_written / trackProgress.bytes_total) * 100)),
    );
  }
  if (job.status === 'running' || trackProgress?.status === 'downloading') {
    const bw = trackProgress?.bytes_written || 0;
    if (bw > 0) return Math.min(85, 4 + Math.floor(bw / 400000));
    return 3;
  }
  if (job.status === 'queued' || trackProgress?.status === 'queued') return 1;
  return 0;
}

function placeholderJob(jobId, title, quality = 'LOSSLESS') {
  return {
    id: jobId,
    title: title || 'Downloading…',
    progress: 1,
    status: 'queued',
    failed: false,
    error: null,
    provider_id: null,
    file_token: null,
    provider: 'tidal',
    quality: quality || 'LOSSLESS',
    url: null,
  };
}

function jobsSnapshotEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.id !== y.id || x.progress !== y.progress || x.status !== y.status || x.failed !== y.failed) return false;
  }
  return true;
}

export default function DownloadToast({ lang = 'en' }) {
  const t = appDict[lang] || appDict.en;
  const [activeJobs, setActiveJobs] = useState([]);
  const [browserProgressMap, setBrowserProgressMap] = useState({});
  const autoDownloadedRef = useRef(new Set());
  const registryRefreshRef = useRef(new Set());
  const browserProgressRef = useRef({});
  const hideAfterRef = useRef({});
  const progressHistoryRef = useRef({});
  const dismissedRef = useRef(new Set());
  const activeJobsRef = useRef([]);
  const pollDelayRef = useRef(POLL_IDLE_MS);
  const optimisticRef = useRef({});
  const fetchNowRef = useRef(null);
  const autoDismissTimersRef = useRef({});

  const setBrowserProgress = useCallback((jobId, value) => {
    browserProgressRef.current[jobId] = value;
    setBrowserProgressMap({ ...browserProgressRef.current });
    if (value === 100) {
      hideAfterRef.current[jobId] = Date.now() + DONE_HIDE_MS;
    }
  }, []);

  const dismissJob = useCallback((jobId) => {
    if (autoDismissTimersRef.current[jobId]) {
      clearTimeout(autoDismissTimersRef.current[jobId]);
      delete autoDismissTimersRef.current[jobId];
    }
    dismissedRef.current.add(jobId);
    delete optimisticRef.current[jobId];
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

  const scheduleAutoDismiss = useCallback(
    (jobId, delayMs = DONE_HIDE_MS) => {
      if (!jobId) return;
      const timers = autoDismissTimersRef.current;
      if (timers[jobId]) clearTimeout(timers[jobId]);
      timers[jobId] = setTimeout(() => {
        delete timers[jobId];
        dismissJob(jobId);
      }, delayMs);
    },
    [dismissJob],
  );

  const setBrowserProgressWithDismiss = useCallback(
    (jobId, value) => {
      setBrowserProgress(jobId, value);
      if (value === 100) scheduleAutoDismiss(jobId, DONE_HIDE_MS);
    },
    [setBrowserProgress, scheduleAutoDismiss],
  );

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

      setBrowserProgressWithDismiss(job.id, 100);
      markJobSaved(job.id);

      const blob = new Blob(chunks);
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const ext = extensionFromResponse(
        response.headers.get('content-disposition'),
        response.headers.get('content-type'),
      );

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

  const pushOptimistic = useCallback((jobId, title, quality) => {
    optimisticRef.current[jobId] = placeholderJob(jobId, title, quality);
    const opt = Object.values(optimisticRef.current);
    const merged = [...opt];
    const seen = new Set(opt.map((j) => j.id));
    for (const j of activeJobsRef.current) {
      if (!seen.has(j.id)) {
        merged.push(j);
        seen.add(j.id);
      }
    }
    activeJobsRef.current = merged;
    setActiveJobs(merged);
  }, []);

  useEffect(() => {
    const onStarted = (e) => {
      const { jobId, title, quality } = e.detail || {};
      if (!jobId || dismissedRef.current.has(jobId)) return;
      pushOptimistic(jobId, title, quality);
      queueMicrotask(() => fetchNowRef.current?.());
    };
    window.addEventListener(DOWNLOAD_JOB_STARTED, onStarted);
    return () => window.removeEventListener(DOWNLOAD_JOB_STARTED, onStarted);
  }, [pushOptimistic]);

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
      if (!hasAuthSession()) {
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

        const results = await Promise.all(jobIds.map((id) => fetchJobStatus(id)));

        const now = Date.now();
        const newItems = [];
        const keepIds = [];
        const seenIds = new Set();

        results.forEach((job) => {
          if (!job) return;
          if (job.job_type === 'analyze_set') return;
          if (dismissedRef.current.has(job.job_id)) return;

          keepIds.push(job.job_id);

          const trackProgress = job.tracks && job.tracks[0];
          const isDone = job.status === 'done' || (trackProgress && trackProgress.status === 'done');
          let isFailed = job.status === 'failed' || (trackProgress && trackProgress.status === 'failed');

          let progress = computeServerProgress(job, trackProgress, isDone);
          const hist = progressHistoryRef.current[job.job_id] || { progress: 0, at: now };
          progress = Math.max(hist.progress, progress);
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
            serverDone: isDone,
            failed: isFailed,
            error: trackProgress?.error || (isFailed ? 'Download stalled or failed' : null),
            provider_id: trackProgress?.provider_id || null,
            trackStatus: trackProgress?.status || null,
            file_token: trackProgress?.file_token || null,
            provider: job.provider || 'tidal',
            quality: job.quality || 'LOSSLESS',
            url: trackProgress?.source_url || null,
          };

          // Auto-save to PC only for downloads started in THIS browser session, and
          // never the same job twice (persisted across reloads/logins). Without this,
          // every finished job still in the queue re-downloaded on the next login —
          // the "all my earlier downloads replay before login" race.
          if (isDone && !registryRefreshRef.current.has(job.job_id)) {
            registryRefreshRef.current.add(job.job_id);
            requestDownloadRegistryRefresh();
          }

          const shouldAutoSaveToPc = willAutoSaveToPc(jobObj, {
            isSessionJob,
            wasJobSaved,
            e2eDisableAutosave: window.__E2E_DISABLE_AUTOSAVE__,
          });

          if (shouldAutoSaveToPc && !autoDownloadedRef.current.has(job.job_id)) {
            autoDownloadedRef.current.add(job.job_id);
            setBrowserProgress(job.job_id, 0);
            handleSaveToPC(jobObj);
          }

          const bpEarly = browserProgressRef.current[job.job_id];
          const pendingPcSave = shouldAutoSaveToPc && (bpEarly === undefined || bpEarly < 100);

          if (isDone && !hideAfterRef.current[job.job_id] && !pendingPcSave) {
            hideAfterRef.current[job.job_id] = now + DONE_HIDE_MS;
            scheduleAutoDismiss(job.job_id, DONE_HIDE_MS);
          }

          const bp = browserProgressRef.current[job.job_id];
          const hideAfter = hideAfterRef.current[job.job_id];
          const visible =
            !dismissedRef.current.has(job.job_id) &&
            (isFailed ||
              !isDone ||
              progress < 100 ||
              bp === -1 ||
              (bp !== undefined && bp >= 0 && bp < 100) ||
              (bp === 100 && hideAfter && now < hideAfter) ||
              (isDone && hideAfter && now < hideAfter));

          if (visible) {
            newItems.push(jobObj);
            seenIds.add(job.job_id);
          } else {
            const idx = keepIds.indexOf(job.job_id);
            if (idx !== -1) keepIds.splice(idx, 1);
          }
          delete optimisticRef.current[job.job_id];
        });

        jobIds.forEach((id) => {
          if (seenIds.has(id) || dismissedRef.current.has(id)) return;
          const opt = optimisticRef.current[id] || placeholderJob(id, null);
          const hist = progressHistoryRef.current[id]?.progress ?? 0;
          newItems.push({ ...opt, progress: Math.max(opt.progress, hist) });
          keepIds.push(id);
        });

        if (keepIds.length !== jobIds.length) {
          localStorage.setItem('tidal-queue-jobs', JSON.stringify(keepIds));
        }

        if (!jobsSnapshotEqual(activeJobsRef.current, newItems)) {
          activeJobsRef.current = newItems;
          setActiveJobs(newItems);
        }

        const hasRunning = newItems.some((j) => jobStillActive(
          j,
          browserProgressRef.current[j.id],
          { isSessionJob, wasJobSaved },
        ));
        schedule(hasRunning ? POLL_ACTIVE_MS : POLL_IDLE_MS);
      } catch (err) {
        console.error(err);
        schedule(POLL_IDLE_MS);
      }
    };

    fetchNowRef.current = () => {
      if (!cancelled) fetchJobs();
    };
    fetchJobs();
    return () => {
      cancelled = true;
      fetchNowRef.current = null;
      clearTimeout(timerId);
      Object.values(autoDismissTimersRef.current).forEach(clearTimeout);
      autoDismissTimersRef.current = {};
    };
  }, [setBrowserProgress, scheduleAutoDismiss]);

  const handleRetry = async (job) => {
    dismissJob(job.id);
    try {
      await retryDownloadJob(job);
    } catch (e) {
      console.error(e);
    }
  };

  const toastLabels = {
    finalizingServer: t.downloadFinalizingServer,
    taggingServer: t.downloadTaggingServer,
    preparingPc: t.downloadPreparingPc,
    savingPc: t.downloadSavingPc,
    readyServer: t.downloadReadyServer,
    savedPc: t.downloadSavedPc,
    starting: t.downloadStarting,
    progress: t.downloadProgress,
    failed: t.downloadFailed,
  };

  const toastOpts = {
    isSessionJob,
    wasJobSaved,
    e2eDisableAutosave: window.__E2E_DISABLE_AUTOSAVE__,
  };

  return (
    <div className="download-toast-stack" aria-live="polite">
      <AnimatePresence mode="popLayout">
        {activeJobs.map((job) => {
          const bp = browserProgressMap[job.id];
          const {
            isFailed,
            isComplete,
            showProgressBar,
            barPct,
            statusText,
          } = computeDownloadToastView(job, bp, toastLabels, toastOpts);

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
                      {statusText}
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

              {showProgressBar && (
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
