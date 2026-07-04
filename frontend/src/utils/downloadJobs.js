/** Track server download jobs shown in DownloadToast (bottom-right). */

import { apiGetJson, apiPostJson } from './apiClient';
import { prefetchAudioToCache } from './cache';

const QUEUE_KEY = 'tidal-queue-jobs';
const SAVED_KEY = 'tidal-saved-jobs';
const SAVED_CAP = 300;
const SESSION_KEY = 'tidal-session-jobs';

export const DOWNLOAD_JOB_STARTED_EVENT = 'tidal-download-job-started';
export const DOWNLOAD_REGISTRY_REFRESH = 'tidal-download-registry-refresh';

/** @deprecated use DOWNLOAD_JOB_STARTED_EVENT */
export const DOWNLOAD_JOB_STARTED = DOWNLOAD_JOB_STARTED_EVENT;

function readIds(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function markSessionJob(jobId) {
  try {
    const ids = readIds(sessionStorage, SESSION_KEY);
    if (!ids.includes(jobId)) {
      ids.push(jobId);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(ids));
    }
  } catch {
    /* ignore */
  }
}

export function isSessionJob(jobId) {
  return !!jobId && readIds(sessionStorage, SESSION_KEY).includes(jobId);
}

export function wasJobSaved(jobId) {
  return !!jobId && readIds(localStorage, SAVED_KEY).includes(jobId);
}

export function markJobSaved(jobId) {
  if (!jobId) return;
  try {
    let ids = readIds(localStorage, SAVED_KEY);
    if (ids.includes(jobId)) return;
    ids.push(jobId);
    if (ids.length > SAVED_CAP) ids = ids.slice(-SAVED_CAP);
    localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
  } catch (e) {
    console.error(e);
  }
}

const LOCAL_DL_KEY = 'tidal-local-downloads';
const LOCAL_DL_CAP = 500;

function readMap(key) {
  try {
    const raw = localStorage.getItem(key);
    const map = raw ? JSON.parse(raw) : {};
    return map && typeof map === 'object' ? map : {};
  } catch {
    return {};
  }
}

/**
 * Record an instant (from-cache) save locally, keyed by track id → epoch ms. Instant
 * saves never hit the server download registry, so this is what the "downloaded < 1h
 * ago" guard consults for them.
 */
export function markTrackDownloadedLocally(trackId) {
  if (!trackId) return;
  try {
    const map = readMap(LOCAL_DL_KEY);
    map[String(trackId)] = Date.now();
    const keys = Object.keys(map);
    if (keys.length > LOCAL_DL_CAP) {
      keys.sort((a, b) => map[a] - map[b])
        .slice(0, keys.length - LOCAL_DL_CAP)
        .forEach((k) => delete map[k]);
    }
    localStorage.setItem(LOCAL_DL_KEY, JSON.stringify(map));
  } catch (e) {
    console.error(e);
  }
}

/** Epoch ms of the last local instant save for this track, or 0. */
export function getLocalDownloadTime(trackId) {
  if (!trackId) return 0;
  return readMap(LOCAL_DL_KEY)[String(trackId)] || 0;
}

export function notifyDownloadJobStarted(jobId, { title = null, quality = null, replaces = null } = {}) {
  if (!jobId || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DOWNLOAD_JOB_STARTED_EVENT, {
    detail: { jobId, title, quality, replaces },
  }));
}

export function enqueueDownloadJob(jobId, { title = null, quality = null, replaces = null } = {}) {
  if (!jobId) return;
  try {
    const jobs = readIds(localStorage, QUEUE_KEY);
    if (!jobs.includes(jobId)) {
      jobs.push(jobId);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(jobs));
    }
    markSessionJob(jobId);
    notifyDownloadJobStarted(jobId, { title, quality, replaces });
  } catch (e) {
    console.error(e);
  }
}

export function removeDownloadJob(jobId) {
  try {
    const jobs = readIds(localStorage, QUEUE_KEY);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(jobs.filter((id) => id !== jobId)));
  } catch (e) {
    console.error(e);
  }
}

export async function retryDownloadJob(jobMeta) {
  if (!jobMeta?.provider_id && !jobMeta?.url) return null;
  const url = jobMeta.url || `https://tidal.com/track/${jobMeta.provider_id}`;
  return startDownloadJob({
    url,
    quality: jobMeta.quality || 'LOSSLESS',
    track: jobMeta.provider_id
      ? { provider: jobMeta.provider || 'tidal', provider_id: jobMeta.provider_id, title: jobMeta.title }
      : null,
  });
}

export async function startDownloadJob({
  url,
  quality = 'LOSSLESS',
  jobType = 'download',
  track = null,
  optimisticId = null,
  prefetch = true,
  split = false,
  lyrics = false,
  karaoke = false,
  dj_analyze = false,
}) {
  const data = await apiPostJson(
    '/api/jobs',
    { url, job_type: jobType, quality, split, lyrics, karaoke, dj_analyze },
    { auth: true },
  );
  const title = track?.title || data.tracks?.[0]?.title || null;
  enqueueDownloadJob(data.job_id, { title, quality, replaces: optimisticId || null });
  if (prefetch && track?.provider_id) {
    void prefetchAudioToCache(
      { ...track, provider: track.provider || 'tidal' },
      quality,
    );
  }
  return data;
}

export async function cancelJob(jobId, lang = 'en') {
  return apiPostJson(`/api/jobs/${jobId}/cancel`, {}, { auth: true, lang });
}

export function requestDownloadRegistryRefresh() {
  window.dispatchEvent(new Event(DOWNLOAD_REGISTRY_REFRESH));
}

export async function fetchJobStatus(jobId) {
  try {
    return await apiGetJson(`/api/jobs/${jobId}`, { auth: true });
  } catch {
    return null;
  }
}
