import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  getNextTrackIndex,
  getPreviousTrackIndex,
  hasQueueSuccessor,
  cycleRepeatMode,
  shuffleTrackList,
  pickRandomIndex,
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

// --- Behavior-locking suite (regression net for a transport refactor) ---
describe('getNextTrackIndex — edges & modes', () => {
  it('empty playlist returns -1 in every mode', () => {
    for (const repeat of [REPEAT_OFF, REPEAT_ALL, REPEAT_ONE]) {
      expect(getNextTrackIndex([], 0, { repeat })).toBe(-1);
      expect(getNextTrackIndex(null, 0, { repeat })).toBe(-1);
    }
  });

  it('advances sequentially in the middle of the queue', () => {
    expect(getNextTrackIndex(pl, 0, { repeat: REPEAT_OFF })).toBe(1);
    expect(getNextTrackIndex(pl, 1, { repeat: REPEAT_OFF })).toBe(2);
  });

  it('clamps an out-of-range currentIdx to 0 then advances', () => {
    expect(getNextTrackIndex(pl, -5, { repeat: REPEAT_OFF })).toBe(1);
    expect(getNextTrackIndex(pl, 99, { repeat: REPEAT_OFF })).toBe(1);
  });

  it('repeat one holds any index, even out of range (clamped)', () => {
    expect(getNextTrackIndex(pl, 0, { repeat: REPEAT_ONE })).toBe(0);
    expect(getNextTrackIndex(pl, 2, { repeat: REPEAT_ONE })).toBe(2);
    expect(getNextTrackIndex(pl, 99, { repeat: REPEAT_ONE })).toBe(0);
  });

  it('shuffle stays in bounds and avoids the current index', () => {
    const seq = [0.0, 0.34, 0.67, 0.99];
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => seq[(i++) % seq.length]);
    for (let n = 0; n < 20; n += 1) {
      const next = getNextTrackIndex(pl, 1, { shuffle: true, repeat: REPEAT_ALL });
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(pl.length);
      expect(next).not.toBe(1);
    }
  });
});

describe('getPreviousTrackIndex', () => {
  it('empty → -1, single → 0', () => {
    expect(getPreviousTrackIndex([], 0)).toBe(-1);
    expect(getPreviousTrackIndex([pl[0]], 0)).toBe(0);
  });
  it('steps back and wraps at the start', () => {
    expect(getPreviousTrackIndex(pl, 2)).toBe(1);
    expect(getPreviousTrackIndex(pl, 1)).toBe(0);
    expect(getPreviousTrackIndex(pl, 0)).toBe(2);
  });
  it('shuffle stays in bounds', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const prev = getPreviousTrackIndex(pl, 0, { shuffle: true });
    expect(prev).toBeGreaterThanOrEqual(0);
    expect(prev).toBeLessThan(pl.length);
  });
});

describe('hasQueueSuccessor', () => {
  it('true for repeat all/one regardless of position', () => {
    expect(hasQueueSuccessor(pl, 2, { repeat: REPEAT_ALL })).toBe(true);
    expect(hasQueueSuccessor(pl, 2, { repeat: REPEAT_ONE })).toBe(true);
  });
  it('sequential: true mid-queue, false on last', () => {
    expect(hasQueueSuccessor(pl, 0, { repeat: REPEAT_OFF })).toBe(true);
    expect(hasQueueSuccessor(pl, 2, { repeat: REPEAT_OFF })).toBe(false);
  });
  it('shuffle: only when more than one track', () => {
    expect(hasQueueSuccessor(pl, 2, { shuffle: true, repeat: REPEAT_OFF })).toBe(true);
    expect(hasQueueSuccessor([pl[0]], 0, { shuffle: true, repeat: REPEAT_OFF })).toBe(false);
  });
  it('empty → false', () => {
    expect(hasQueueSuccessor([], 0, { repeat: REPEAT_ALL })).toBe(false);
  });
});

describe('pickRandomIndex', () => {
  it('handles empty / single / pair deterministically', () => {
    expect(pickRandomIndex(0, 0)).toBe(-1);
    expect(pickRandomIndex(1, 0)).toBe(0);
    expect(pickRandomIndex(2, 0)).toBe(1);
    expect(pickRandomIndex(2, 1)).toBe(0);
  });
  it('never returns the excluded index for length ≥ 3', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // would pick 0 every time
    // excludeIdx 0 + always-0 random → falls back to a different index, not 0.
    expect(pickRandomIndex(3, 0)).not.toBe(0);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
