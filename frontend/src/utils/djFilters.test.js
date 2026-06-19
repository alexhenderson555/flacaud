import { describe, expect, it } from 'vitest';
import { isBpmFilterActive, trackMatchesDjFilters } from './djFilters.js';

describe('djFilters', () => {
  it('detects active bpm filter', () => {
    expect(isBpmFilterActive({ min: 60, max: 200 })).toBe(false);
    expect(isBpmFilterActive({ min: 120, max: 200 })).toBe(true);
    expect(isBpmFilterActive({ min: 60, max: 150 })).toBe(true);
  });

  it('filters by camelot when known', () => {
    const feat = { bpm: 128, camelotKey: '8A' };
    expect(trackMatchesDjFilters(feat, { filterKey: '8A', bpmRange: { min: 60, max: 200 } })).toBe(true);
    expect(trackMatchesDjFilters(feat, { filterKey: '9A', bpmRange: { min: 60, max: 200 } })).toBe(false);
  });

  it('keeps pending tracks visible while filters on', () => {
    expect(trackMatchesDjFilters(null, { filterKey: '8A', bpmRange: { min: 120, max: 140 }, isBpmActive: true })).toBe(true);
  });

  it('filters bpm when feature known', () => {
    const feat = { bpm: 100, camelotKey: '5A' };
    expect(trackMatchesDjFilters(feat, { filterKey: null, bpmRange: { min: 120, max: 140 }, isBpmActive: true })).toBe(false);
    expect(trackMatchesDjFilters(feat, { filterKey: null, bpmRange: { min: 90, max: 110 }, isBpmActive: true })).toBe(true);
  });
});
