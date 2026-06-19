import { useEffect, useRef } from 'react';
import { getAudioAnalyser, initAudioEngine } from '../utils/audioEngine';
import {
  computeBarLevels,
  smoothBarLevels,
} from '../utils/visualizerBands';

const FRAME_MS = 1000 / 30;
const GRAD_BUCKETS = 36;
const MAX_DPR = 2;

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

export default function AudioVisualizer({ audioRef, isPlaying = false }) {
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
    if (!isPlaying) return undefined;

    let cancelled = false;
    let waitRaf = null;
    let playEl = null;
    let lastFrame = 0;

    const bindAnalyser = () => {
      if (!audioRef?.current) return false;
      initAudioEngine(audioRef);
      const analyser = getAudioAnalyser(audioRef);
      if (!analyser) return false;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      return true;
    };

    const onPlay = () => bindAnalyser();

    const waitForAudio = () => {
      if (cancelled) return;
      const el = audioRef?.current;
      if (!el) {
        waitRaf = requestAnimationFrame(waitForAudio);
        return;
      }
      if (playEl !== el) {
        playEl?.removeEventListener('play', onPlay);
        playEl = el;
        playEl.addEventListener('play', onPlay);
      }
      if (!bindAnalyser()) {
        waitRaf = requestAnimationFrame(waitForAudio);
      }
    };
    waitForAudio();

    const canvas = canvasRef.current;
    if (!canvas) {
      return () => {
        cancelled = true;
        if (waitRaf) cancelAnimationFrame(waitRaf);
        playEl?.removeEventListener('play', onPlay);
      };
    }

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

    const draw = (time = 0) => {
      if (cancelled) return;
      if (document.visibilityState === 'hidden' || !isPlaying) return;

      if (time - lastFrame < FRAME_MS) {
        reqRef.current = requestAnimationFrame(draw);
        return;
      }
      lastFrame = time;

      if (!analyserRef.current && !bindAnalyser()) {
        reqRef.current = requestAnimationFrame(draw);
        return;
      }

      const { accent } = colorsRef.current;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      const targetLevels = computeBarLevels(dataArrayRef.current, window.innerWidth);
      const smoothed = smoothBarLevels(smoothLevelsRef.current, targetLevels);
      smoothLevelsRef.current = smoothed;
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

      reqRef.current = requestAnimationFrame(draw);
    };

    reqRef.current = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      if (waitRaf) cancelAnimationFrame(waitRaf);
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      playEl?.removeEventListener('play', onPlay);
    };
  }, [audioRef, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="audio-visualizer"
      className="audio-visualizer-canvas"
      aria-hidden
    />
  );
}
