import { apiFetch, apiPostJson, parseJsonSafe, ApiError } from './apiClient';

/** yt-dlp + Tidal matching can take a while on large playlists */
const TRANSFER_TIMEOUT_MS = 180_000;
const TRANSFER_POLL_MS = 500;
const TRANSFER_POLL_MAX_MS = 10 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollTransferTask(taskId, { lang = 'en', onProgress, signal } = {}) {
  const started = Date.now();
  while (Date.now() - started < TRANSFER_POLL_MAX_MS) {
    if (signal?.aborted) {
      throw new ApiError('Cancelled', { code: 'aborted' });
    }
    const res = await apiFetch(`/api/transfer/tasks/${encodeURIComponent(taskId)}`, {
      lang,
      timeoutMs: 20_000,
    });
    const task = await parseJsonSafe(res);
    if (!res.ok) {
      throw new ApiError(task?.detail || `HTTP ${res.status}`, { status: res.status });
    }
    onProgress?.(task.progress);
    if (task.status === 'done' && task.preview) {
      return { ...task.preview, task_id: task.task_id };
    }
    if (task.status === 'failed') {
      throw new ApiError(task.error || 'Preview failed', { code: 'failed' });
    }
    await sleep(TRANSFER_POLL_MS);
  }
  throw new ApiError('Request timed out — server is slow, try again', { code: 'timeout' });
}

export async function previewTransfer(url, lang = 'en', { onProgress, signal } = {}) {
  const start = await apiPostJson(
    '/api/transfer/preview',
    { url: url.trim() },
    { lang, timeoutMs: 30_000, retries: 1 },
  );
  const taskId = start?.task_id;
  if (!taskId) {
    throw new ApiError('Preview did not start', { code: 'failed' });
  }
  onProgress?.({ phase: 'queued', done: 0, total: 0, matched: 0, percent: 2, label: '' });
  return pollTransferTask(taskId, { lang, onProgress, signal });
}

export async function importTransfer(
  {
    url,
    taskId = null,
    addToLibrary = true,
    createPlaylist = true,
    playlistName = null,
    downloadFlac = false,
    quality = 'LOSSLESS',
    selectedIndices = null,
  },
  lang = 'en',
) {
  return apiPostJson(
    '/api/transfer/import',
    {
      url: url?.trim() || null,
      task_id: taskId,
      add_to_library: addToLibrary,
      create_playlist: createPlaylist,
      playlist_name: playlistName,
      download_flac: downloadFlac,
      quality,
      selected_indices: selectedIndices,
    },
    { auth: true, lang, timeoutMs: TRANSFER_TIMEOUT_MS, retries: 1 },
  );
}
