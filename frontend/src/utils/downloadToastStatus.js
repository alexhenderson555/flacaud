/**
 * Download toast phase + status text (server job + optional PC auto-save).
 */

import { qualityBadgeLabel } from './qualityPrefs';

function statusWithQuality(text, quality) {
  const badge = qualityBadgeLabel(quality);
  return badge ? `${text} · ${badge}` : text;
}

export function willAutoSaveToPc(job, { isSessionJob, wasJobSaved, e2eDisableAutosave = false } = {}) {
  if (!job || e2eDisableAutosave) return false;
  const serverDone = job.serverDone === true || job.status === 'done';
  if (!serverDone || !job.file_token) return false;
  if (!isSessionJob?.(job.id)) return false;
  if (wasJobSaved?.(job.id)) return false;
  return true;
}

export function computeDownloadToastView(job, bp, labels, opts = {}) {
  const {
    isSessionJob = () => false,
    wasJobSaved = () => false,
    e2eDisableAutosave = false,
  } = opts;

  const t = labels || {};
  const isFailed = job.failed || bp === -1;
  const serverDone = job.serverDone === true || job.status === 'done';
  const autoSave = willAutoSaveToPc(job, { isSessionJob, wasJobSaved, e2eDisableAutosave });
  const tagging = job.trackStatus === 'tagging';
  const finalizingServer = !serverDone && (tagging || job.progress >= 99);
  const savingToPc = autoSave && bp !== undefined && bp >= 0 && bp < 100;
  const pendingPcSave = autoSave && (bp === undefined || bp < 100);
  const savedToPc = autoSave && bp === 100;
  const readyOnServerOnly = serverDone && !autoSave && !isFailed;

  const isComplete = savedToPc || readyOnServerOnly;

  const serverPct = Math.max(job.progress, job.status === 'queued' ? 1 : 0);
  let barPct;
  if (pendingPcSave || savingToPc) {
    barPct = bp !== undefined && bp >= 0 ? bp : serverPct;
  } else if (!serverDone) {
    barPct = serverPct;
  } else {
    barPct = bp !== undefined && bp >= 0 ? bp : 100;
  }

  const showProgressBar = !isFailed && (
    !serverDone
    || finalizingServer
    || savingToPc
    || pendingPcSave
    || (bp !== undefined && bp < 100)
  );

  let statusText;
  if (isFailed) {
    statusText = job.error || t.failed || 'Download failed';
  } else if (savingToPc || (pendingPcSave && bp !== undefined && bp > 0)) {
    statusText = (t.savingPc || 'Saving to PC… {pct}%').replace('{pct}', String(bp ?? 0));
  } else if (pendingPcSave) {
    statusText = t.preparingPc || 'Preparing save to PC…';
  } else if (tagging) {
    statusText = t.taggingServer || 'Writing tags…';
  } else if (finalizingServer) {
    statusText = t.finalizingServer || 'Finalizing on server…';
  } else if (savedToPc) {
    statusText = t.savedPc || 'Saved to PC';
  } else if (readyOnServerOnly) {
    statusText = t.readyServer || 'Ready on server';
  } else if (job.status === 'queued') {
    statusText = t.starting || 'Starting…';
  } else {
    statusText = (t.progress || 'Downloading… {pct}%').replace('{pct}', String(serverPct));
  }

  statusText = statusWithQuality(statusText, job.quality);

  return {
    isFailed,
    isComplete,
    showProgressBar,
    barPct,
    statusText,
    serverDone,
    pendingPcSave,
    autoSave,
  };
}

export function jobStillActive(job, bp, { isSessionJob, wasJobSaved } = {}) {
  if (!job || job.failed) return false;
  if (!job.serverDone && job.status !== 'done') return true;
  if (willAutoSaveToPc(job, { isSessionJob, wasJobSaved })) {
    return bp !== 100;
  }
  return false;
}
