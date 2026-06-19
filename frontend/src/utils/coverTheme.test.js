import { describe, expect, it } from 'vitest';
import { extractCoverAccent } from './coverTheme';

describe('extractCoverAccent', () => {
  it('returns hsl accent for mid-tone pixels', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 80;
      data[i + 1] = 120;
      data[i + 2] = 200;
      data[i + 3] = 255;
    }
    const accent = extractCoverAccent(data, 4, 4);
    expect(accent).not.toBeNull();
    expect(accent.solid).toMatch(/^hsl\(/);
    expect(accent.glow).toMatch(/^hsla\(/);
  });

  it('returns null when only extreme luminance pixels', () => {
    const data = new Uint8ClampedArray(16);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
    expect(extractCoverAccent(data, 2, 2)).toBeNull();
  });
});
