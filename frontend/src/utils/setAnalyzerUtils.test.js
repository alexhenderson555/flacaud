import { describe, expect, it } from 'vitest';
import {
  analyzerJobSucceededDespiteFailedStatus,
  formatAnalyzerErrorMessage,
  normalizeSetMatchedTrack,
  parseSetTimestamp,
  resolveAnalyzerJobOutcome,
  setTrackRowDurationSeconds,
} from './setAnalyzerUtils';

const t = (key) => ({
  analysisFailed: 'Analysis failed',
  analysisPartialFailed: 'Found {n} tracks, but analysis did not finish.',
  analysisPartialTimeout: 'Found {n} tracks — still scanning.',
  analysisTimedOut: 'Timed out',
  analysisCancelled: 'Cancelled',
}[key] || key);

describe('resolveAnalyzerJobOutcome', () => {
  it('treats failed+done phase with tracks as success', () => {
    const data = {
      status: 'failed',
      set_tracks: [{}, {}, {}],
      analysis: { phase: 'done', label: 'Analysis complete' },
      tracks: [{ title: 'Analysis complete', status: 'queued' }],
    };
    expect(analyzerJobSucceededDespiteFailedStatus(data)).toBe(true);
    const outcome = resolveAnalyzerJobOutcome(data, t);
    expect(outcome.status).toBe('done');
    expect(outcome.error).toBeNull();
  });

  it('does not append Analysis complete to partial failed copy', () => {
    const msg = formatAnalyzerErrorMessage({
      status: 'failed',
      trackCount: 3,
      serverError: 'Analysis complete',
      t,
    });
    expect(msg).not.toContain('Analysis complete');
    expect(msg).toContain('3');
  });
});

describe('formatAnalyzerErrorMessage', () => {
  it('shows partial message when tracks exist', () => {
    const msg = formatAnalyzerErrorMessage({
      status: 'failed',
      trackCount: 3,
      serverError: 'disk full',
      t,
    });
    expect(msg).toContain('3');
    expect(msg).toContain('disk full');
  });

  it('shows timeout hint when polling stops early', () => {
    const msg = formatAnalyzerErrorMessage({
      status: 'failed',
      trackCount: 1,
      timedOut: true,
      t,
    });
    expect(msg).toContain('1');
  });
});

describe('parseSetTimestamp', () => {
  it('parses mm:ss', () => {
    expect(parseSetTimestamp('1:30')).toBe(90);
    expect(parseSetTimestamp('0:05')).toBe(5);
  });

  it('parses hh:mm:ss', () => {
    expect(parseSetTimestamp('1:02:03')).toBe(3723);
  });

  it('returns 0 for invalid input', () => {
    expect(parseSetTimestamp('')).toBe(0);
    expect(parseSetTimestamp('nope')).toBe(0);
  });
});

describe('normalizeSetMatchedTrack', () => {
  it('fills artists from row when match omits them', () => {
    const track = normalizeSetMatchedTrack({
      artist: 'KEKURA & Sonofsteve',
      title: 'What U Waiting For',
      matched_track: {
        provider: 'tidal',
        provider_id: 4242,
        title: 'What U Waiting For',
        duration_s: 247,
      },
    });
    expect(track?.provider_id).toBe('4242');
    expect(track?.artists).toEqual(['KEKURA & Sonofsteve']);
  });

  it('returns null without provider_id', () => {
    expect(normalizeSetMatchedTrack({
      artist: 'A',
      matched_track: { title: 'X' },
    })).toBeNull();
  });
});

describe('setTrackRowDurationSeconds', () => {
  it('prefers tidal match duration', () => {
    const sec = setTrackRowDurationSeconds(
      { timestamp: '0:00' },
      { timestamp: '5:00' },
      { duration_s: 245 },
    );
    expect(sec).toBe(245);
  });

  it('falls back to timestamp gap in the set', () => {
    const sec = setTrackRowDurationSeconds(
      { timestamp: '1:00' },
      { timestamp: '4:30' },
      null,
    );
    expect(sec).toBe(210);
  });

  it('returns 0 without match or next timestamp', () => {
    expect(setTrackRowDurationSeconds({ timestamp: '0:00' }, null, null)).toBe(0);
  });
});
