import { describe, expect, it } from 'vitest';
import {
  buildSetDjInsights,
  getHarmonicMatches,
  transitionQuality,
} from './setDjInsights';

describe('setDjInsights', () => {
  it('returns harmonic neighbors for Camelot keys', () => {
    expect(getHarmonicMatches('9A')).toEqual(['9A', '10A', '8A', '9B']);
  });

  it('scores smooth same-key transitions', () => {
    expect(transitionQuality('10A', '10A', 126, 127)).toBe('smooth');
  });

  it('builds insights from matched rows with features', () => {
    const rows = [
      { timestamp: '00:00', title: 'A', matched_track: { provider_id: '1', title: 'A' } },
      { timestamp: '05:00', title: 'B', matched_track: { provider_id: '2', title: 'B' } },
    ];
    const resolve = (row) => ({
      bpm: row.matched_track.provider_id === '1' ? 124 : 126,
      camelotKey: row.matched_track.provider_id === '1' ? '9A' : '10A',
      analyzed: true,
    });
    const insights = buildSetDjInsights(rows, resolve);
    expect(insights.hasData).toBe(true);
    expect(insights.avgBpm).toBe(125);
    expect(insights.highlight?.label).toBe('9A → 10A');
    expect(insights.bpmSeries).toHaveLength(2);
  });
});
