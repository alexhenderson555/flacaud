/** Track server download jobs shown in DownloadToast (bottom-right). */

const QUEUE_KEY = 'tidal-queue-jobs';
// Jobs whose finished file was already auto-saved to the user's machine. Persisted
// in localStorage so a reload or re-login never re-downloads what already completed.
const SAVED_KEY = 'tidal-saved-jobs';
const SAVED_CAP = 300;
// Jobs started in THIS browser tab/session. sessionStorage survives a reload but is
// cleared when the tab closes — so a job polled from a *previous* session counts as
// a leftover and is never silently re-downloaded.
const SESSION_KEY = 'tidal-session-jobs';

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

export function enqueueDownloadJob(jobId) {
  if (!jobId) return;
  try {
    const jobs = readIds(localStorage, QUEUE_KEY);
    if (!jobs.includes(jobId)) {
      jobs.push(jobId);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(jobs));
    }
    markSessionJob(jobId);
  } catch (e) {
    console.error(e);
  }
}

export function removeDownloadJob(jobId) {
  try {
    const jobs = readIds(localStorage, QUEUE_KEY);
    const next = jobs.filter((id) => id !== jobId);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch (e) {
    console.error(e);
  }
}

export async function retryDownloadJob(jobMeta) {
  if (!jobMeta?.provider_id && !jobMeta?.url) return null;
  const url = jobMeta.url || `https://tidal.com/track/${jobMeta.provider_id}`;
  return startDownloadJob({ url, quality: jobMeta.quality || 'LOSSLESS' });
}

export async function startDownloadJob({ url, quality = 'LOSSLESS', jobType = 'download' }) {
  const token = localStorage.getItem('tidal-token') || '';
  const res = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url, job_type: jobType, quality }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || 'Failed to start download');
  }
  enqueueDownloadJob(data.job_id);
  return data;
}
