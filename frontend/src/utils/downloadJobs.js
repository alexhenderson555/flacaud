/** Track server download jobs shown in DownloadToast (bottom-right). */

import { apiFetch, apiGetJson, apiPostJson } from './apiClient';
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

const SET_DOWNLOAD_POLL_MS = 1500;
const SET_DOWNLOAD_MAX_ATTEMPTS = 240; // ~6 minutes

/**
 * Download a DJ set's raw audio (YouTube/SoundCloud, via yt-dlp on the
 * server) as a browser file — not a Tidal catalog download, so it uses the
 * "download_set" job type + the set audio cache, not startDownloadJob.
 */
export async function downloadSetAudio(url, { lang = 'en', filename = 'set.mp3' } = {}) {
  const { job_id: jobId } = await apiPostJson(
    '/api/jobs', { url, job_type: 'download_set' }, { auth: true, lang },
  );

  for (let attempt = 0; attempt < SET_DOWNLOAD_MAX_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, SET_DOWNLOAD_POLL_MS));
    const status = await fetchJobStatus(jobId);
    if (!status) continue;
    if (status.status === 'failed' || status.status === 'cancelled') {
      throw new Error(status.tracks?.[0]?.error || 'Set download failed');
    }
    if (status.status === 'done') {
      const params = new URLSearchParams({ url });
      const res = await apiFetch(`/api/sets/cached-audio?${params.toString()}`, { auth: true });
      if (!res.ok) throw new Error('Could not fetch downloaded audio');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      return;
    }
  }
  throw new Error('Set download timed out');
}
