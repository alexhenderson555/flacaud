/**
 * Sample dominant color from cover art → CSS vars for player chrome tint.
 */

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

export function extractCoverAccent(imageData, width, height) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const step = 4 * Math.max(1, Math.floor((width * height) / 4096));
  for (let i = 0; i < imageData.length; i += step) {
    const pr = imageData[i];
    const pg = imageData[i + 1];
    const pb = imageData[i + 2];
    const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
    if (lum < 24 || lum > 232) continue;
    r += pr;
    g += pg;
    b += pb;
    n += 1;
  }
  if (!n) return null;
  r = Math.round(r / n);
  g = Math.round(g / n);
  b = Math.round(b / n);
  const [h, s, l] = rgbToHsl(r, g, b);
  return {
    solid: `hsl(${Math.round(h)} ${Math.min(72, Math.round(s))}% ${Math.min(58, Math.max(38, Math.round(l)))}%)`,
    glow: `hsla(${Math.round(h)}, ${Math.min(70, Math.round(s))}%, ${Math.round(l)}%, 0.35)`,
  };
}

export function applyCoverTheme(accent) {
  const root = document.documentElement;
  if (!accent) {
    root.style.removeProperty('--cover-accent');
    root.style.removeProperty('--cover-accent-glow');
    root.style.removeProperty('--cover-accent-text');
    root.removeAttribute('data-cover-theme');
    return;
  }
  root.style.setProperty('--cover-accent', accent.solid);
  root.style.setProperty('--cover-accent-glow', accent.glow);
  root.style.setProperty('--cover-accent-text', '#ffffff');
  root.setAttribute('data-cover-theme', '1');
}

export async function sampleCoverTheme(coverUrl) {
  if (!coverUrl || typeof document === 'undefined') return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const loaded = new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
    });
    img.src = coverUrl;
    await loaded;
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    return extractCoverAccent(data, size, size);
  } catch {
    return null;
  }
}
