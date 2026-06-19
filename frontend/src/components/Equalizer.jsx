import { useState, useEffect, useMemo, useId } from 'react';
import { motion } from 'framer-motion';
import { Sliders, X } from 'lucide-react';

const FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const PRESETS = [
  { id: 'flat', label: 'Flat' },
  { id: 'bass', label: 'Bass' },
  { id: 'vocal', label: 'Vocal' },
  { id: 'electronic', label: 'Electronic' },
];

const PRESET_GAINS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [6, 5, 4, 2, 0, -1, -2, 0, 1, 2],
  vocal: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1],
  electronic: [5, 4, 2, 0, -2, 0, 1, 3, 4, 5],
};

function formatFreq(freq) {
  return freq >= 1000 ? `${freq / 1000}k` : String(freq);
}

function formatDb(gain) {
  if (Math.abs(gain) < 0.05) return '0';
  const sign = gain > 0 ? '+' : '';
  return `${sign}${gain.toFixed(1)}`;
}

function gainFillStyle(gain) {
  const pct = (Math.abs(gain) / 12) * 50;
  if (gain >= 0) {
    return { bottom: '50%', height: `${pct}%` };
  }
  return { top: '50%', height: `${pct}%` };
}

function buildCurvePaths(gains, width, height) {
  const padX = 14;
  const padY = 10;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const midY = padY + innerH / 2;
  const maxDelta = innerH / 2;

  const points = gains.map((g, i) => {
    const x = padX + (i / (gains.length - 1)) * innerW;
    const y = midY - (g / 12) * maxDelta;
    return { x, y };
  });

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${points[points.length - 1].x.toFixed(1)} ${midY} L ${points[0].x.toFixed(1)} ${midY} Z`;
  return { line, area };
}

export default function Equalizer({ audioCtx, audioRef, onClose }) {
  const curveId = useId().replace(/:/g, '');
  const [nodes, setNodes] = useState([]);
  const [gains, setGains] = useState(() => [...PRESET_GAINS.flat]);
  const [activePreset, setActivePreset] = useState('flat');

  useEffect(() => {
    if (!audioCtx || !audioRef.current || !audioRef.current._sourceNode) return;

    if (!audioRef.current._eqNodes) {
      const eqNodes = FREQUENCIES.map((freq) => {
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1;
        filter.gain.value = 0;
        return filter;
      });

      const sourceNode = audioRef.current._sourceNode;
      const analyser = audioRef.current._analyser;

      if (sourceNode && analyser) {
        sourceNode.disconnect();
        sourceNode.connect(eqNodes[0]);
        for (let i = 0; i < eqNodes.length - 1; i += 1) {
          eqNodes[i].connect(eqNodes[i + 1]);
        }
        eqNodes[eqNodes.length - 1].connect(analyser);
        audioRef.current._eqNodes = eqNodes;
        setNodes(eqNodes);
      }
    } else {
      setNodes(audioRef.current._eqNodes);
      setGains(audioRef.current._eqNodes.map((n) => n.gain.value));
      setActivePreset('custom');
    }
  }, [audioCtx, audioRef]);

  const applyGains = (newGains) => {
    setGains(newGains);
    nodes.forEach((n, i) => {
      if (n) n.gain.value = newGains[i];
    });
  };

  const handleGainChange = (index, value) => {
    const newGains = [...gains];
    newGains[index] = value;
    applyGains(newGains);
    setActivePreset('custom');
  };

  const applyPreset = (preset) => {
    applyGains([...PRESET_GAINS[preset]]);
    setActivePreset(preset);
  };

  const curve = useMemo(() => buildCurvePaths(gains, 360, 72), [gains]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 28, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className="eq-panel glass-panel"
      data-testid="equalizer-panel"
    >
      <div className="eq-panel__glow" aria-hidden />

      <div className="eq-panel__head">
        <div className="eq-panel__title">
          <span className="eq-panel__icon">
            <Sliders size={18} />
          </span>
          <span>Equalizer</span>
        </div>
        <button type="button" className="eq-panel__close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="eq-panel__presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`eq-preset${activePreset === preset.id ? ' eq-preset--active' : ''}`}
            onClick={() => applyPreset(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="eq-panel__curve-wrap">
        <svg className="eq-panel__curve" viewBox="0 0 360 72" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={`eq-fill-${curveId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-solid)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--accent-solid)" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`eq-line-${curveId}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#6a11cb" />
              <stop offset="100%" stopColor="var(--accent-solid)" />
            </linearGradient>
          </defs>
          <line x1="14" y1="36" x2="346" y2="36" className="eq-panel__curve-zero" />
          <path d={curve.area} fill={`url(#eq-fill-${curveId})`} />
          <path d={curve.line} fill="none" stroke={`url(#eq-line-${curveId})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="eq-panel__bands">
        {FREQUENCIES.map((freq, i) => (
          <div key={freq} className="eq-band">
            <span className={`eq-band__db${gains[i] !== 0 ? ' eq-band__db--active' : ''}`}>
              {formatDb(gains[i])}
            </span>
            <div className="eq-band__track">
              <div className="eq-band__track-bg" />
              <div className="eq-band__zero" />
              <div
                className={`eq-band__fill${gains[i] >= 0 ? ' eq-band__fill--boost' : ' eq-band__fill--cut'}`}
                style={gainFillStyle(gains[i])}
              />
              <input
                type="range"
                className="eq-band__range"
                min="-12"
                max="12"
                step="0.1"
                value={gains[i]}
                aria-label={`${formatFreq(freq)} Hz`}
                onChange={(e) => handleGainChange(i, parseFloat(e.target.value))}
              />
            </div>
            <span className="eq-band__freq">{formatFreq(freq)}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
