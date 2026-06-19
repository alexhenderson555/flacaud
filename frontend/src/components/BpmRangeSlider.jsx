const BPM_MIN = 60;
const BPM_MAX = 200;

function pct(value) {
  return ((value - BPM_MIN) / (BPM_MAX - BPM_MIN)) * 100;
}

const PRESETS = [
  { id: 'slow', min: 70, max: 100, label: '70–100' },
  { id: 'club', min: 118, max: 132, label: '118–132' },
  { id: 'fast', min: 130, max: 150, label: '130–150' },
];

export default function BpmRangeSlider({ min, max, onChange, variant = 'classic' }) {
  const safeMin = Math.max(BPM_MIN, Math.min(min, max - 1));
  const safeMax = Math.min(BPM_MAX, Math.max(max, safeMin + 1));
  const fillLeft = pct(safeMin);
  const fillWidth = pct(safeMax) - fillLeft;
  const rootClass = variant === 'modern' ? 'bpm-range-modern' : 'bpm-range-dual';

  const slider = (
    <>
      <div className={`${rootClass}__track`} />
      <div
        className={`${rootClass}__fill`}
        style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
      />
      <input
        type="range"
        className={`${rootClass}__input`}
        min={BPM_MIN}
        max={BPM_MAX}
        value={safeMin}
        aria-label="Minimum BPM"
        onChange={(e) => {
          const nextMin = Math.min(Number(e.target.value), safeMax - 1);
          onChange({ min: nextMin, max: safeMax });
        }}
      />
      <input
        type="range"
        className={`${rootClass}__input`}
        min={BPM_MIN}
        max={BPM_MAX}
        value={safeMax}
        aria-label="Maximum BPM"
        onChange={(e) => {
          const nextMax = Math.max(Number(e.target.value), safeMin + 1);
          onChange({ min: safeMin, max: nextMax });
        }}
      />
    </>
  );

  if (variant !== 'modern') {
    return (
      <div className={rootClass} data-testid="bpm-range-slider">
        {slider}
        <div className="bpm-range-dual__caption">
          {safeMin} – {safeMax} BPM
        </div>
      </div>
    );
  }

  return (
    <div className={rootClass} data-testid="bpm-range-slider">
      <div className="bpm-range-modern__readout" aria-live="polite">
        <span className="bpm-range-modern__value">{safeMin}</span>
        <span className="bpm-range-modern__sep">–</span>
        <span className="bpm-range-modern__value">{safeMax}</span>
        <span className="bpm-range-modern__unit">BPM</span>
      </div>
      <div className="bpm-range-modern__slider-wrap">
        <div className="bpm-range-modern__ends">
          <span>{BPM_MIN}</span>
          <span>{BPM_MAX}</span>
        </div>
        {slider}
      </div>
      <div className="bpm-range-modern__presets">
        {PRESETS.map((p) => {
          const active = safeMin === p.min && safeMax === p.max;
          return (
            <button
              key={p.id}
              type="button"
              className={`bpm-range-modern__preset${active ? ' bpm-range-modern__preset--active' : ''}`}
              onClick={() => onChange({ min: p.min, max: p.max })}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
