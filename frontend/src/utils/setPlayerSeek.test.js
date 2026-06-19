import { describe, expect, it, vi } from 'vitest';
import { seekSetPlayer } from './setPlayerSeek';

describe('seekSetPlayer', () => {
  it('sets currentTime and calls play', () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const el = { currentTime: 0, play };
    expect(seekSetPlayer(el, 90)).toBe(true);
    expect(el.currentTime).toBe(90);
    expect(play).toHaveBeenCalled();
  });

  it('uses embed player seekTo API', () => {
    const api = { seekTo: vi.fn(() => true) };
    expect(seekSetPlayer(api, 120)).toBe(true);
    expect(api.seekTo).toHaveBeenCalledWith(120);
  });

  it('returns false without element', () => {
    expect(seekSetPlayer(null, 10)).toBe(false);
  });
});
