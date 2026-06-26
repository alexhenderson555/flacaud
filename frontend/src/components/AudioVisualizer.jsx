import { useCallback, useEffect, useRef } from 'react';
import { getAudioAnalyser, initAudioEngine, resumeAudioContext } from '../utils/audioEngine';
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
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
}

export default function AudioVisualizer({ audioRef, getMainAudioEl }) {
  const canvasRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const reqRef = useRef(null);
  const colorsRef = useRef(readAccentColors());
  const gradCacheRef = useRef([]);
  const smoothLevelsRef = useRef(null);

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
    return () => window.removeEventListener('resize', onResize);
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
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
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
        decayBars();
        return;
      }

      if (time - lastFrame < FRAME_MS) return;
      lastFrame = time;

      if (!analyserRef.current && !bindAnalyser()) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      const targetLevels = computeBarLevels(dataArrayRef.current, window.innerWidth);
      const smoothed = smoothBarLevels(smoothLevelsRef.current, targetLevels);
      smoothLevelsRef.current = smoothed;
      paintBars(smoothed);
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
