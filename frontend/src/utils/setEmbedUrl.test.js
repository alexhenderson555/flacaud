import { describe, it, expect } from 'vitest';
import {
  classifySetUrl,
  parseYoutubeVideoId,
  normalizeSoundCloudEmbedUrl,
  soundCloudWidgetSrc,
} from './setEmbedUrl.js';

describe('setEmbedUrl', () => {
  it('classifies youtube and soundcloud', () => {
    expect(classifySetUrl('https://www.youtube.com/watch?v=abc')).toBe('youtube');
    expect(classifySetUrl('https://soundcloud.com/a/b')).toBe('soundcloud');
    expect(classifySetUrl('https://tidal.com/track/1')).toBe(null);
  });

  it('parses youtube video ids', () => {
    expect(parseYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('strips soundcloud tracking params for widget', () => {
    const raw = 'https://soundcloud.com/mmf/me?si=abc&utm_source=share';
    expect(normalizeSoundCloudEmbedUrl(raw)).toBe('https://soundcloud.com/mmf/me');
    expect(soundCloudWidgetSrc(raw)).toContain(encodeURIComponent('https://soundcloud.com/mmf/me'));
  });
});
