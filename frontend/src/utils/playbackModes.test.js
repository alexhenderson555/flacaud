import { describe, it, expect } from 'vitest';
import {
  getNextTrackIndex,
  getPreviousTrackIndex,
  hasQueueSuccessor,
  cycleRepeatMode,
  shuffleTrackList,
  REPEAT_OFF,
  REPEAT_ALL,
  REPEAT_ONE,
} from './playbackModes';

const pl = [{ id: 1 }, { id: 2 }, { id: 3 }];

describe('playbackModes', () => {
  it('cycles repeat off → all → one → off', () => {
    expect(cycleRepeatMode(REPEAT_OFF)).toBe(REPEAT_ALL);
    expect(cycleRepeatMode(REPEAT_ALL)).toBe(REPEAT_ONE);
    expect(cycleRepeatMode(REPEAT_ONE)).toBe(REPEAT_OFF);
  });

  it('sequential stops at end when repeat off', () => {
    expect(getNextTrackIndex(pl, 2, { repeat: REPEAT_OFF })).toBe(-1);
    expect(hasQueueSuccessor(pl, 2, { repeat: REPEAT_OFF })).toBe(false);
  });

  it('repeat all wraps', () => {
    expect(getNextTrackIndex(pl, 2, { repeat: REPEAT_ALL })).toBe(0);
  });

  it('repeat one stays on same index', () => {
    expect(getNextTrackIndex(pl, 1, { repeat: REPEAT_ONE })).toBe(1);
  });

  it('single track repeats only when repeat all', () => {
    expect(getNextTrackIndex([pl[0]], 0, { repeat: REPEAT_OFF })).toBe(-1);
    expect(getNextTrackIndex([pl[0]], 0, { repeat: REPEAT_ALL })).toBe(0);
    expect(getNextTrackIndex([pl[0]], 0, { repeat: REPEAT_ONE })).toBe(0);
  });

  it('shuffle picks a different index when repeat off', () => {
    for (let i = 0; i < 40; i += 1) {
      const next = getNextTrackIndex(pl, 1, { shuffle: true, repeat: REPEAT_OFF });
      expect(next).not.toBe(1);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(3);
    }
  });

  it('previous wraps sequentially', () => {
    expect(getPreviousTrackIndex(pl, 0)).toBe(2);
  });

  it('shuffleTrackList preserves items', () => {
    const shuffled = shuffleTrackList(pl);
    expect(shuffled).toHaveLength(3);
    expect(shuffled.map((t) => t.id).sort()).toEqual([1, 2, 3]);
    expect(shuffled).not.toBe(pl);
  });
});
