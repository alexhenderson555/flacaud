import { describe, expect, it } from 'vitest';
import { computeDownloadToastView, jobStillActive } from './downloadToastStatus';

const labels = {
  taggingServer: 'Writing tags…',
  finalizingServer: 'Finalizing on server…',
  preparingPc: 'Preparing save to PC…',
  savingPc: 'Saving to PC… {pct}%',
  readyServer: 'Ready on server',
  savedPc: 'Saved to PC',
  progress: 'Downloading… {pct}%',
};

describe('computeDownloadToastView', () => {
  it('shows tagging when worker reports tagging phase', () => {
    const view = computeDownloadToastView(
      { progress: 100, status: 'running', trackStatus: 'tagging', failed: false },
      undefined,
      labels,
    );
    expect(view.statusText).toBe('Writing tags…');
    expect(view.isComplete).toBe(false);
  });

  it('shows finalizing when bytes at 100% but job still running', () => {
    const view = computeDownloadToastView(
      { progress: 100, status: 'running', failed: false },
      undefined,
      labels,
    );
    expect(view.statusText).toBe('Finalizing on server…');
    expect(view.isComplete).toBe(false);
    expect(view.showProgressBar).toBe(true);
  });

  it('does not show ready on server while session auto-save is pending', () => {
    const view = computeDownloadToastView(
      {
        id: 'j1',
        progress: 100,
        status: 'done',
        serverDone: true,
        file_token: 'tok',
        failed: false,
      },
      undefined,
      labels,
      { isSessionJob: () => true, wasJobSaved: () => false },
    );
    expect(view.statusText).toBe('Preparing save to PC…');
    expect(view.isComplete).toBe(false);
  });

  it('shows ready on server only for non-session completed jobs', () => {
    const view = computeDownloadToastView(
      {
        progress: 100,
        status: 'done',
        serverDone: true,
        file_token: 'tok',
        failed: false,
      },
      undefined,
      labels,
      { isSessionJob: () => false },
    );
    expect(view.statusText).toBe('Ready on server');
    expect(view.isComplete).toBe(true);
  });

  it('appends quality badge to status text', () => {
    const view = computeDownloadToastView(
      { progress: 40, status: 'running', quality: 'LOSSLESS', failed: false },
      undefined,
      labels,
    );
    expect(view.statusText).toBe('Downloading… 40% · Lossless');

    const hi = computeDownloadToastView(
      { progress: 10, status: 'running', quality: 'HIGH', failed: false },
      undefined,
      labels,
    );
    expect(hi.statusText).toBe('Downloading… 10% · 320k');
  });

  it('keeps bar aligned with server percent while preparing PC save', () => {
    const view = computeDownloadToastView(
      {
        id: 'j1',
        progress: 10,
        status: 'done',
        serverDone: true,
        file_token: 'tok',
        failed: false,
      },
      undefined,
      labels,
      { isSessionJob: () => true, wasJobSaved: () => false },
    );
    expect(view.barPct).toBe(10);
    expect(view.statusText).toBe('Preparing save to PC…');
  });
});

describe('jobStillActive', () => {
  it('stays active while finalizing on server', () => {
    expect(jobStillActive({ progress: 100, status: 'running', failed: false })).toBe(true);
  });

  it('stays active until PC save completes', () => {
    const job = {
      id: 'j1',
      progress: 100,
      status: 'done',
      serverDone: true,
      file_token: 'tok',
      failed: false,
    };
    expect(jobStillActive(job, 40, { isSessionJob: () => true, wasJobSaved: () => false })).toBe(true);
    expect(jobStillActive(job, 100, { isSessionJob: () => true, wasJobSaved: () => false })).toBe(false);
  });
});
