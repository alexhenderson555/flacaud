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

const FRAME_MS = 1000 / 60;
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

    // --- Beat tracking (shared by the dynamic modes) ---------------------------
    // Bass-weighted instant energy vs. its slow rolling average detects kicks;
    // beatEnv punches to 1 on a hit and decays fast, driving the "pop" everywhere.
    let energyAvg = 0;
    let beatEnv = 0;
    let lastBeat = -1e9;
    let spin = 0; // rotation accumulator (radial / orb)
    const ripples = []; // expanding rings emitted on beats (orb mode)
    let peaks = null; // peak-hold heights per bar (bars mode)

    const updateBeat = (smoothed, time) => {
      let e = 0;
      const n = Math.min(12, smoothed.length);
      for (let i = 0; i < n; i += 1) e += smoothed[i];
      e = n ? e / n / 255 : 0;
      energyAvg = energyAvg * 0.92 + e * 0.08;
      if (e > energyAvg * 1.28 && e > 0.1 && time - lastBeat > 110) {
        lastBeat = time;
        beatEnv = 1;
        if (modeRef.current === 'orb') ripples.push({ r: 0, a: 1 });
      } else {
        beatEnv *= 0.86;
      }
      spin += 0.003 + e * 0.012;
      return { e };
    };

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

    // Spectrum wrapped around a rotating ring; the ring flares and every spoke
    // stretches on the beat. Glow is kept on the single ring (not per-spoke) so
    // it stays cheap at 60fps.
    const paintRadial = (smoothed, beat) => {
      const { accent } = colorsRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const minDim = Math.min(w, h);
      const baseR = minDim * (0.14 + beat.e * 0.05 + beatEnv * 0.06);
      const half = Math.min(64, smoothed.length);
      const stepIdx = smoothed.length / half;
      const total = half * 2;
      ctx.save();
      ctx.lineCap = 'round';
      // glowing ring that flares on the beat
      ctx.beginPath();
      ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
      ctx.strokeStyle = accent;
      ctx.shadowBlur = 18 + beatEnv * 30;
      ctx.shadowColor = accent;
      ctx.globalAlpha = 0.45 + beatEnv * 0.45;
      ctx.lineWidth = Math.max(1.5, minDim * 0.003) * (1 + beatEnv * 2.5);
      ctx.stroke();
      // spectrum spokes (mirrored, rotating), length amplified + beat-boosted
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(2, minDim * 0.0055);
      for (let i = 0; i < total; i += 1) {
        const m = i < half ? i : total - 1 - i;
        const val = (smoothed[Math.floor(m * stepIdx)] || 0) / 255;
        const ang = (i / total) * Math.PI * 2 - Math.PI / 2 + spin;
        const len = baseR + val * minDim * 0.32 * (0.7 + beatEnv * 0.7);
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        ctx.beginPath();
        ctx.moveTo(cx + cos * baseR, cy + sin * baseR);
        ctx.lineTo(cx + cos * len, cy + sin * len);
        ctx.stroke();
      }
      ctx.restore();
    };

    // A central orb with a hot white core that swells with energy + punches on
    // the beat, a frequency "crown" of spokes, and rings that fly outward on hits.
    const paintOrb = (smoothed, beat) => {
      const { accent, transparent } = colorsRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const minDim = Math.min(w, h);
      const energy = visualizerPeakLevel(smoothed) / 255;
      const r = minDim * (0.1 + energy * 0.08 + beat.e * 0.06 + beatEnv * 0.14);
      ctx.save();
      ctx.lineCap = 'round';
      // beat-emitted ripples (age + cull in place)
      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        const rp = ripples[i];
        rp.r += minDim * 0.014;
        rp.a *= 0.95;
        if (rp.a < 0.03) { ripples.splice(i, 1); continue; }
        ctx.globalAlpha = rp.a * 0.55;
        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(1.5, minDim * 0.0035);
        ctx.beginPath();
        ctx.arc(cx, cy, r + rp.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // frequency crown
      const spokes = Math.min(64, smoothed.length);
      const stepIdx = smoothed.length / spokes;
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(2, minDim * 0.004);
      for (let i = 0; i < spokes; i += 1) {
        const val = (smoothed[Math.floor(i * stepIdx)] || 0) / 255;
        const ang = (i / spokes) * Math.PI * 2 + spin;
        const r0 = r * 1.08;
        const r1 = r0 + val * minDim * 0.17 * (0.6 + beatEnv * 0.9);
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        ctx.beginPath();
        ctx.moveTo(cx + c * r0, cy + s * r0);
        ctx.lineTo(cx + c * r1, cy + s * r1);
        ctx.stroke();
      }
      // glowing core with a hot white center
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.35, accent);
      grad.addColorStop(1, transparent);
      ctx.shadowBlur = 40 + beatEnv * 60;
      ctx.shadowColor = accent;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // Frequency-domain wave: smoothly connecting the frequency bins.
    const paintWave = (smoothed, beat) => {
      const { accent } = colorsRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;
      const n = smoothed.length;
      const step = w / Math.max(1, n - 1);
      const amp = h * (0.3 + beat.e * 0.2 + beatEnv * 0.15);

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      
      // Draw top edge
      for (let i = 0; i < n; i += 1) {
        const v = smoothed[i] / 255;
        const x = i * step;
        const y = mid - v * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      
      // Draw bottom edge (mirrored)
      for (let i = n - 1; i >= 0; i -= 1) {
        const v = smoothed[i] / 255;
        const x = i * step;
        const y = mid + v * amp;
        ctx.lineTo(x, y);
      }
      ctx.closePath();

      ctx.shadowBlur = 24 + beatEnv * 36;
      ctx.shadowColor = accent;
      
      // Fill with a soft glow
      const grad = ctx.createLinearGradient(0, mid - amp, 0, mid + amp);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(0.5, `rgba(255,255,255,${0.15 + beatEnv * 0.15})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fill();

      // Stroke outer edge
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(3, h * 0.005);
      ctx.stroke();
      
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255,255,255,${0.6 + beatEnv * 0.4})`;
      ctx.lineWidth = Math.max(1.2, h * 0.002);
      ctx.stroke();
      
      ctx.restore();
    };

    // A 3D-like tunnel of concentric rings rushing toward the viewer.
    const paintVortex = (smoothed, beat, time) => {
      const { accent } = colorsRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const minDim = Math.min(w, h);
      
      const numRings = 24;
      const speed = time * 0.001 * (1 + beatEnv * 0.8);
      
      ctx.save();
      ctx.lineJoin = 'round';
      
      for (let i = 0; i < numRings; i += 1) {
        // Compute depth 0..1 where 1 is furthest away, 0 is at screen
        const z = (i / numRings - (speed % (1 / numRings)) + 1) % 1;
        const scale = 1 / (z + 0.02); 
        if (scale > 40) continue;
        
        const baseR = minDim * 0.02 * scale;
        const points = 64;
        const stepIdx = smoothed.length / (points / 2); // mirrored half
        
        ctx.beginPath();
        for (let j = 0; j <= points; j += 1) {
          const m = j < points / 2 ? j : points - j;
          const val = (smoothed[Math.floor(m * stepIdx)] || 0) / 255;
          const ang = (j / points) * Math.PI * 2 + spin * (i % 2 === 0 ? 1 : -0.5) + z;
          // Rings warp heavily to the bass
          const r = baseR + val * minDim * 0.015 * scale * (0.8 + beatEnv * 0.5);
          const x = cx + Math.cos(ang) * r;
          const y = cy + Math.sin(ang) * r;
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        
        // Fade out in distance, fade out when flying past the camera
        const alpha = Math.max(0, Math.min(1, (1 - z) * 1.5)) * Math.min(1, z * 10);
        ctx.globalAlpha = alpha * (0.4 + beatEnv * 0.6);
        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(1, 2 * scale * 0.15);
        
        if (i % 3 === 0) {
          ctx.shadowBlur = 20 * scale * beatEnv;
          ctx.shadowColor = accent;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
      }
      ctx.restore();
    };

    const paintMode = (mode, smoothed, beat, time) => {
      if (mode === 'radial') return paintRadial(smoothed, beat);
      if (mode === 'orb') return paintOrb(smoothed, beat);
      if (mode === 'vortex') return paintVortex(smoothed, beat, time);
      if (mode === 'wave') {
        return paintWave(smoothed, beat);
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
      const beat = updateBeat(smoothed, time);
      paintMode(modeRef.current, smoothed, beat, time);
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
