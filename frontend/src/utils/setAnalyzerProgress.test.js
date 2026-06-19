import { describe, expect, it } from 'vitest';
import {
  ANALYZER_POLL_MS,
  ANALYZER_SCAN_INTERVAL_SEC,
  formatAnalyzerSegments,
  resolveAnalyzerProgress,
} from './setAnalyzerProgress';

describe('resolveAnalyzerProgress', () => {
  it('maps queued status to first stage', () => {
    expect(resolveAnalyzerProgress(null, { status: 'queued' })).toMatchObject({
      stageIndex: 0,
      barPercent: 2,
      inScanPhase: false,
    });
  });

  it('prefers structured analysis from API', () => {
    expect(resolveAnalyzerProgress('legacy', {
      status: 'running',
      trackCount: 2,
      analysis: {
        phase: 'scan',
        percent: 55,
        segments_done: 12,
        segments_total: 80,
        tracks_found: 4,
        label: 'Analyzing… 40%',
      },
    })).toMatchObject({
      stageIndex: 2,
      barPercent: 55,
      inScanPhase: true,
      segmentsDone: 12,
      segmentsTotal: 80,
      tracksFound: 4,
      phase: 'scan',
    });
  });

  it('maps download percent from server label (legacy)', () => {
    expect(resolveAnalyzerProgress('Downloading Set… 42%', { status: 'running' })).toMatchObject({
      stageIndex: 0,
      barPercent: 6,
    });
  });

  it('maps processing and shazam scan phases (legacy)', () => {
    expect(resolveAnalyzerProgress('Processing audio…', { status: 'running' })).toMatchObject({
      stageIndex: 1,
      inScanPhase: false,
    });
    expect(resolveAnalyzerProgress('Analyzing… 50%', { status: 'running' })).toMatchObject({
      stageIndex: 2,
      barPercent: 57,
      inScanPhase: true,
    });
  });

  it('raises bar when tracks appear during scan', () => {
    const r = resolveAnalyzerProgress('Analyzing… 10%', { status: 'running', trackCount: 5 });
    expect(r.barPercent).toBeGreaterThanOrEqual(35);
  });

  it('advances to identify stage when tracks exist but phase lags', () => {
    expect(resolveAnalyzerProgress('Processing audio…', {
      status: 'running',
      trackCount: 1,
      analysis: {
        phase: 'process',
        percent: 16,
        label: 'Processing audio…',
        tracks_found: 0,
      },
    })).toMatchObject({
      stageIndex: 2,
      inScanPhase: true,
      tracksFound: 1,
      phase: 'scan',
    });
  });
});

describe('formatAnalyzerSegments', () => {
  it('formats segment counters', () => {
    expect(formatAnalyzerSegments(3, 10, 'en')).toBe('Segment 3 of 10');
    expect(formatAnalyzerSegments(3, 10, 'ru')).toBe('Сегмент 3 из 10');
    expect(formatAnalyzerSegments(0, 0, 'en')).toBe('');
  });
});

describe('analyzer constants', () => {
  it('documents poll interval and scan step', () => {
    expect(ANALYZER_POLL_MS).toBe(2000);
    expect(ANALYZER_SCAN_INTERVAL_SEC).toBe(30);
  });
});
