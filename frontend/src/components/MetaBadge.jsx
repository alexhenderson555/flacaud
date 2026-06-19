/**
 * Theme-aware pill badge — quality (solid), DJ meta (soft), secondary (muted).
 */
export default function MetaBadge({ children, variant = 'soft', title, className = '' }) {
  const variantClass =
    variant === 'solid'
      ? 'meta-badge--solid'
      : variant === 'muted'
        ? 'meta-badge--muted'
        : '';
  return (
    <span
      className={['meta-badge', variantClass, className].filter(Boolean).join(' ')}
      title={title}
    >
      {children}
    </span>
  );
}
