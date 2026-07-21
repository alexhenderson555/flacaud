/** Range input with a filled gradient track + glowing thumb (see .fancy-slider in index.css). */
export default function FancySlider({ min, max, step, value, onChange, ariaLabel }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className="fancy-slider"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      aria-label={ariaLabel}
      style={{ '--pct': `${pct}%` }}
    />
  );
}
