import { useCallback, useEffect, useRef } from 'react';
import { getAudioAnalyser, initAudioEngine, resumeAudioContext } from '../utils/audioEngine';
import { usePlayerStore } from '../store/usePlayerStore';
import {
  computeBarLevels,
  smoothBarLevels,
} from '../utils/visualizerBands';
import {
  visualizerPeakLevel,
  visualizerShouldAnimate,
} from '../utils/visualizerRuntime';

const FRAME_MS = 1000 / 30;
const GRAD_BUCKETS = 36;
const MAX_DPR = 2;
const IDLE_ATTACK = 0.2;
const IDLE_DECAY = 0.28;
const IDLE_CUTOFF = 0.5;

function readAccentColors() {
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent-solid')
    .trim() || '#2575fc';
  const transparent = accent.startsWith('rgb(')
    ? accent.replace('rgb(', 'rgba(').replace(')', ', 0.25)')
    : `${accent}40`;
  return { accent, transparent };
}

function resizeVisualizerCanvas(canvas) {
  // In fullscreen (cinema) the viewport jumps to the full screen resolution; at
  // DPR 2 that's ~3x the pixels to paint per frame and the bars stutter. Cap DPR
  // to 1 in fullscreen — the soft bars don't need the extra crispness.
  const maxDpr = document.fullscreenElement ? 1 : MAX_DPR;
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
}

export default function AudioVisualizer({ audioRef, getMainAudioEl }) {
  const canvasRef = useRef(null);
  const analyserRef = useRef(null);
  const boundElRef = useRef(null);
  const dataArrayRef = useRef(null);
  const reqRef = useRef(null);
  const colorsRef = useRef(readAccentColors());
  const gradCacheRef = useRef([]);
  const smoothLevelsRef = useRef(null);
  const timeDataRef = useRef(null);
  // Visual style read through a ref so switching modes doesn't tear down the
  // animation loop / re-bind the analyser.
  const visualMode = usePlayerStore((s) => s.visualMode);
  const modeRef = useRef(visualMode);
  useEffect(() => { modeRef.current = visualMode; }, [visualMode]);

  useEffect(() => {
    colorsRef.current = readAccentColors();
    gradCacheRef.current = [];
    const onTheme = () => {
      colorsRef.current = readAccentColors();
      gradCacheRef.current = [];
    };
    const observer = new MutationObserver(onTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style'],
    });
    return () => observer.disconnect();
  }, []);

  const resolveAudioEl = useCallback(
    () => getMainAudioEl?.() ?? audioRef?.current ?? null,
    [audioRef, getMainAudioEl],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const onResize = () => {
      resizeVisualizerCanvas(canvas);
      gradCacheRef.current = [];
    };
    onResize();
    window.addEventListener('resize', onResize);
    // Entering/leaving fullscreen changes the viewport + the DPR cap above.
    document.addEventListener('fullscreenchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onResize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let cancelled = false;
    let waitRaf = null;
    let playEl = null;
    let lastFrame = 0;

    const bindAnalyser = () => {
      const el = resolveAudioEl();
      if (!el) return false;
      initAudioEngine({ current: el });
      resumeAudioContext();
      const analyser = getAudioAnalyser({ current: el });
      if (!analyser) return false;
      analyserRef.current = analyser;
      boundElRef.current = el;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      timeDataRef.current = new Uint8Array(analyser.fftSize);
      return true;
    };

    const onPlay = () => bindAnalyser();

    const waitForAudio = () => {
      if (cancelled) return;
      const el = resolveAudioEl();
      if (!el) {
        waitRaf = requestAnimationFrame(waitForAudio);
        return;
      }
      if (playEl !== el) {
        playEl?.removeEventListener('play', onPlay);
        analyserRef.current = null;
        smoothLevelsRef.current = null;
        playEl = el;
        playEl.addEventListener('play', onPlay);
      }
      if (!bindAnalyser()) {
        waitRaf = requestAnimationFrame(waitForAudio);
      }
    };
    waitForAudio();

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      resumeAudioContext();
      bindAnalyser();
      lastFrame = 0;
    };
    document.addEventListener('visibilitychange', onVisibility);

    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

    const gradientForBar = (barHeight) => {
      const height = canvas.height;
      const bucket = Math.min(
        GRAD_BUCKETS - 1,
        Math.max(0, Math.floor((barHeight / (height * 0.6)) * GRAD_BUCKETS)),
      );
      const cache = gradCacheRef.current;
      if (!cache[bucket]) {
        const sampleH = ((bucket + 1) / GRAD_BUCKETS) * height * 0.6;
        const { accent, transparent } = colorsRef.current;
        const grad = ctx.createLinearGradient(0, height, 0, height - sampleH);
        grad.addColorStop(0, transparent);
        grad.addColorStop(1, accent);
        cache[bucket] = grad;
      }
      return cache[bucket];
    };

    const paintBars = (smoothed) => {
      const { accent } = colorsRef.current;
      const width = canvas.width;
      const height = canvas.height;
      const barCount = smoothed.length;
      const barWidth = width / barCount;
      const gap = Math.min(4, Math.max(1, barWidth * 0.12));

      ctx.shadowBlur = 30;
      ctx.shadowColor = accent;

      let x = 0;
      for (let i = 0; i < barCount; i += 1) {
        const val = smoothed[i];
        const barHeight = (val / 255) * (height * 0.6);
        ctx.fillStyle = gradientForBar(barHeight);
        ctx.fillRect(x, height - barHeight, Math.max(1, barWidth - gap), barHeight);
        x += barWidth;
      }
    };

    // Spectrum wrapped around a circle, mirrored; the inner ring pulses with the
    // overall energy so it breathes with the beat.
    const paintRadial = (smoothed) => {
      const { accent } = colorsRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const minDim = Math.min(w, h);
      const energy = visualizerPeakLevel(smoothed) / 255;
      const baseR = minDim * 0.16 * (1 + energy * 0.18);
      // Subsample + mirror to keep stroke (and shadow) count bounded.
      const half = Math.min(56, smoothed.length);
      const stepIdx = smoothed.length / half;
      const total = half * 2;
      ctx.save();
      ctx.shadowBlur = 16;
      ctx.shadowColor = accent;
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(2, minDim * 0.004);
      ctx.lineCap = 'round';
      for (let i = 0; i < total; i += 1) {
        const m = i < half ? i : total - 1 - i;
        const val = (smoothed[Math.floor(m * stepIdx)] || 0) / 255;
        const ang = (i / total) * Math.PI * 2 - Math.PI / 2;
        const len = baseR + val * minDim * 0.26;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        ctx.beginPath();
        ctx.moveTo(cx + cos * baseR, cy + sin * baseR);
        ctx.lineTo(cx + cos * len, cy + sin * len);
        ctx.stroke();
      }
      ctx.restore();
    };

    // A central glowing orb that swells with energy, ringed by pulses driven by
    // the bass bands.
    const paintOrb = (smoothed) => {
      const { accent, transparent } = colorsRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const minDim = Math.min(w, h);
      const energy = visualizerPeakLevel(smoothed) / 255;
      let bass = 0;
      const nb = Math.min(6, smoothed.length);
      for (let i = 0; i < nb; i += 1) bass += smoothed[i];
      bass = nb ? bass / nb / 255 : 0;
      const r = minDim * (0.12 + energy * 0.13);
      ctx.save();
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, accent);
      grad.addColorStop(1, transparent);
      ctx.shadowBlur = 50;
      ctx.shadowColor = accent;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1.5, minDim * 0.0025);
      for (let k = 1; k <= 3; k += 1) {
        ctx.globalAlpha = 0.35 / k;
        ctx.beginPath();
        ctx.arc(cx, cy, r + k * (minDim * 0.03 + bass * minDim * 0.12), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    };

    // Time-domain oscilloscope — the raw waveform, so it tracks the rhythm 1:1.
    const paintWave = (timeData) => {
      const { accent } = colorsRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;
      const n = timeData.length;
      const step = Math.max(1, Math.floor(n / (w / 2)));
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(2, h * 0.004);
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 18;
      ctx.shadowColor = accent;
      ctx.beginPath();
      let first = true;
      for (let i = 0; i < n; i += step) {
        const v = (timeData[i] - 128) / 128;
        const x = (i / n) * w;
        const y = mid + v * (h * 0.32);
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    const paintMode = (mode, smoothed) => {
      if (mode === 'radial') return paintRadial(smoothed);
      if (mode === 'orb') return paintOrb(smoothed);
      if (mode === 'wave') {
        if (analyserRef.current && timeDataRef.current) {
          analyserRef.current.getByteTimeDomainData(timeDataRef.current);
          return paintWave(timeDataRef.current);
        }
        return undefined;
      }
      return paintBars(smoothed);
    };

    const decayBars = () => {
      const width = canvas.width;
      const height = canvas.height;
      const prev = smoothLevelsRef.current;
      if (!prev?.length) {
        ctx.clearRect(0, 0, width, height);
        return;
      }
      const zeros = new Uint8Array(prev.length);
      const decayed = smoothBarLevels(prev, zeros, IDLE_ATTACK, IDLE_DECAY);
      smoothLevelsRef.current = decayed;
      ctx.clearRect(0, 0, width, height);
      if (visualizerPeakLevel(decayed) > IDLE_CUTOFF) {
        paintBars(decayed);
      } else {
        smoothLevelsRef.current = null;
      }
    };

    const draw = (time = 0) => {
      if (cancelled) return;
      reqRef.current = requestAnimationFrame(draw);

      const el = resolveAudioEl();
      const shouldAnimate = visualizerShouldAnimate({
        visibilityState: document.visibilityState,
        audioEl: el,
      });

      if (!shouldAnimate) {
        if (modeRef.current === 'bars') {
          decayBars();
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          smoothLevelsRef.current = null;
        }
        return;
      }

      if (time - lastFrame < FRAME_MS) return;
      lastFrame = time;

      // Re-bind when the main <audio> element swaps to the other A/B slot (e.g. a
      // quality change 320k -> lossless), otherwise the analyser stays on the
      // now-idle element and the visualizer goes flat / disappears.
      if (el && el !== boundElRef.current) bindAnalyser();
      if (!analyserRef.current && !bindAnalyser()) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      const targetLevels = computeBarLevels(dataArrayRef.current, window.innerWidth);
      const smoothed = smoothBarLevels(smoothLevelsRef.current, targetLevels);
      smoothLevelsRef.current = smoothed;
      paintMode(modeRef.current, smoothed);
    };

    reqRef.current = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (waitRaf) cancelAnimationFrame(waitRaf);
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      playEl?.removeEventListener('play', onPlay);
    };
  }, [audioRef, getMainAudioEl, resolveAudioEl]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="audio-visualizer"
      className="audio-visualizer-canvas"
      aria-hidden
    />
  );
}
