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

function resizeVisualizerCanvas(canvas, isCinema) {
  // In fullscreen (cinema) the viewport jumps to the full screen resolution; at
  // DPR 2 that's ~3x the pixels to paint per frame and the bars stutter. Cap DPR
  // to 1 in fullscreen — the soft bars don't need the extra crispness.
  const maxDpr = (document.fullscreenElement || isCinema) ? 1 : MAX_DPR;
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
  const cinema = usePlayerStore((s) => s.cinema);
  const visualSensitivity = usePlayerStore((s) => s.visualSensitivity) ?? 1.0;
  const visualSmoothing = usePlayerStore((s) => s.visualSmoothing) ?? 0.5;
  
  const modeRef = useRef(visualMode);
  const sensitivityRef = useRef(visualSensitivity);
  const smoothingRef = useRef(visualSmoothing);
  
  useEffect(() => { modeRef.current = visualMode; }, [visualMode]);
  useEffect(() => { sensitivityRef.current = visualSensitivity; }, [visualSensitivity]);
  useEffect(() => { smoothingRef.current = visualSmoothing; }, [visualSmoothing]);

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
      resizeVisualizerCanvas(canvas, cinema);
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
  }, [cinema]);

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

    let prevE = 0;
    const updateBeat = (smoothed, time) => {
      let e = 0;
      const n = Math.min(12, smoothed.length);
      for (let i = 0; i < n; i += 1) e += smoothed[i];
      e = n ? e / n / 255 : 0;
      
      const delta = Math.max(0, e - prevE);
      prevE = e;
      
      energyAvg = energyAvg * 0.92 + e * 0.08;
      
      // Trigger beat on significant rise over average OR sharp sudden spike (delta)
      const isBeat = (e > energyAvg * 1.2 || delta > 0.05) && e > 0.05 && (time - lastBeat > 110);
      
      if (isBeat) {
        lastBeat = time;
        beatEnv = 1;
        if (modeRef.current === 'particles') ripples.push({ r: 0, a: 1 });
      } else {
        beatEnv *= 0.86;
      }
      spin += 0.003 + e * 0.012;
      return { e, delta };
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

    // Hyperspace particle system: Stars flying outward from the center that react to bass.
    const maxParticles = 400;
    const paintParticles = (smoothed, beat) => {
      const { accent } = colorsRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      
      // Spawn new particles based on energy
      if (ripples.length < maxParticles) {
        const toSpawn = Math.floor(1 + beat.e * 10 + beatEnv * 20);
        for (let i = 0; i < toSpawn && ripples.length < maxParticles; i++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = Math.random() * 40 + 20;
          ripples.push({
            ang, dist, 
            speed: Math.random() * 3 + 1,
            baseSize: Math.random() * 2.5 + 1,
            life: 1.0,
            band: Math.floor(Math.pow(Math.random(), 2) * smoothed.length) // more bass stars
          });
        }
      }

      ctx.save();
      ctx.strokeStyle = accent;
      ctx.shadowBlur = 10 + beatEnv * 15;
      ctx.shadowColor = accent;
      
      // Extreme acceleration on beat
      const globalSpeedMult = 1 + beat.e * 2 + beatEnv * 5;
      
      for (let i = ripples.length - 1; i >= 0; i--) {
        const p = ripples[i];
        
        // Individual frequency reactivity
        const v = (smoothed[p.band] || 0) / 255;
        const localSpeedMult = globalSpeedMult * (1 + v * 3);
        
        // Calculate previous position for motion blur (shooting star effect)
        const prevDist = p.dist;
        p.dist += p.speed * localSpeedMult * (p.dist * 0.015);
        p.ang += 0.001;
        p.life -= 0.004 * localSpeedMult;
        
        const prevX = cx + Math.cos(p.ang + spin) * prevDist;
        const prevY = cy + Math.sin(p.ang + spin) * prevDist;
        const x = cx + Math.cos(p.ang + spin) * p.dist;
        const y = cy + Math.sin(p.ang + spin) * p.dist;
        
        if (p.life <= 0 || x < 0 || x > w || y < 0 || y > h) {
          ripples.splice(i, 1);
          continue;
        }

        ctx.globalAlpha = Math.min(1, p.life * 2) * (0.2 + v * 0.8 + beatEnv * 0.4);
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        const renderSize = p.baseSize * (p.dist * 0.005) * (1 + v * 3 + beatEnv);
        ctx.lineWidth = Math.max(0.5, renderSize);
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Draw a glowing bass core in the center
      const coreR = Math.min(w, h) * (0.05 + beat.e * 0.03 + beatEnv * 0.08);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2);
      grad.addColorStop(0, `rgba(255,255,255,${0.6 + beatEnv * 0.4})`);
      grad.addColorStop(0.2, accent);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.shadowBlur = 40 + beatEnv * 60;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 2, 0, Math.PI * 2);
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
      if (mode === 'particles') return paintParticles(smoothed, beat);
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
      const decayed = smoothBarLevels(prev, zeros, smoothingRef.current);
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
      
      // Apply sensitivity to the raw frequency data before any processing
      let scaledData = dataArrayRef.current;
      if (sensitivityRef.current !== 1.0) {
        scaledData = new Uint8Array(dataArrayRef.current.length);
        for (let i = 0; i < scaledData.length; i++) {
          scaledData[i] = Math.min(255, dataArrayRef.current[i] * sensitivityRef.current);
        }
      }

      const targetLevels = computeBarLevels(scaledData, window.innerWidth);
      const smoothed = smoothBarLevels(smoothLevelsRef.current, targetLevels, smoothingRef.current);
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
