/** Track server download jobs shown in DownloadToast (bottom-right). */

export function enqueueDownloadJob(jobId) {
  if (!jobId) return;
  try {
    const saved = localStorage.getItem('tidal-queue-jobs');
    const jobs = saved ? JSON.parse(saved) : [];
    if (!jobs.includes(jobId)) {
      jobs.push(jobId);
      localStorage.setItem('tidal-queue-jobs', JSON.stringify(jobs));
    }
  } catch (e) {
    console.error(e);
  }
}

export function removeDownloadJob(jobId) {
  try {
    const saved = localStorage.getItem('tidal-queue-jobs');
    const jobs = saved ? JSON.parse(saved) : [];
    const next = jobs.filter((id) => id !== jobId);
    localStorage.setItem('tidal-queue-jobs', JSON.stringify(next));
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
