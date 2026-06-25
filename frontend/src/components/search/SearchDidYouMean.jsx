export default function SearchDidYouMean({ label, suggestion, onApply, className = '' }) {
  if (!suggestion) return null;
  return (
    <button
      type="button"
      className={`search-typo-hint ${className}`.trim()}
      onClick={onApply}
      aria-label={`${label}: ${suggestion}`}
    >      {label}: <strong>{suggestion}</strong>
    </button>
  );
}
