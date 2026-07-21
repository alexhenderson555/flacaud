import { describe, expect, it, vi } from 'vitest';
import { seekWithoutClick } from './usePlayerHotkeys';

/**
 * Minimal fake <audio> element: EventTarget-based so addEventListener/
 * removeEventListener/dispatchEvent behave like the real DOM API that
 * seekWithoutClick relies on.
 */
function makeFakeAudioEl({ muted = false, duration = 300 } = {}) {
  const target = new EventTarget();
  const el = {
    muted,
    duration,
    currentTime: 0,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
  return el;
}

describe('seekWithoutClick', () => {
  it('restores the original mute state after a single seek settles', () => {
    vi.useFakeTimers();
    const el = makeFakeAudioEl({ muted: false });
    seekWithoutClick(el, 10);
    expect(el.muted).toBe(true);
    el.dispatchEvent(new Event('seeked'));
    expect(el.muted).toBe(false);
    vi.useRealTimers();
  });

  it('stays unmuted after a rapid-fire seek storm, even if each seek settles slowly', () => {
    // Reproduces "seek many times in a row via the keyboard": a burst of
    // seeks fired before any prior one's `seeked` event lands (the reported
    // production bug — audio goes silent and stays silent on later tracks).
    vi.useFakeTimers();
    const el = makeFakeAudioEl({ muted: false });

    for (let i = 0; i < 8; i += 1) {
      seekWithoutClick(el, i * 5);
    }
    expect(el.muted).toBe(true); // muted for the duration of the burst

    // Each seek's `seeked` event lands out of order relative to firing order,
    // as real overlapping HTMLMediaElement seeks can.
    for (let i = 7; i >= 0; i -= 1) {
      el.dispatchEvent(new Event('seeked'));
    }

    expect(el.muted).toBe(false);
    vi.useRealTimers();
  });

  it('falls back to the 250ms timeout and still restores mute when seeked never fires', () => {
    vi.useFakeTimers();
    const el = makeFakeAudioEl({ muted: false });

    seekWithoutClick(el, 5);
    seekWithoutClick(el, 10);
    seekWithoutClick(el, 15);

    // No `seeked` events at all (e.g. the load was aborted mid-seek).
    vi.advanceTimersByTime(250);

    expect(el.muted).toBe(false);
    vi.useRealTimers();
  });

  it('preserves an originally-muted element as muted once the burst settles', () => {
    vi.useFakeTimers();
    const el = makeFakeAudioEl({ muted: true });

    seekWithoutClick(el, 5);
    seekWithoutClick(el, 10);
    el.dispatchEvent(new Event('seeked'));
    el.dispatchEvent(new Event('seeked'));

    expect(el.muted).toBe(true);
    vi.useRealTimers();
  });
});
