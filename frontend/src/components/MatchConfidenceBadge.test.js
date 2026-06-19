import { describe, expect, it } from 'vitest';
import { confidenceClass } from '../components/MatchConfidenceBadge';

// export helper for test — add to component
describe('match confidence', () => {
  it('classifies scores', () => {
    expect(confidenceClass(0.95)).toBe('sync-match--high');
    expect(confidenceClass(0.8)).toBe('sync-match--mid');
    expect(confidenceClass(0.5)).toBe('sync-match--low');
    expect(confidenceClass(null)).toBe('sync-match--unknown');
  });
});
