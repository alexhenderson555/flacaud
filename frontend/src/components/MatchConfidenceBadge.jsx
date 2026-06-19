/**
 * Confidence badge for track sync match score.
 * score: 0..1 or null
 */
export function confidenceClass(score) {
  if (score == null) return 'sync-match--unknown';
  if (score >= 0.9) return 'sync-match--high';
  if (score >= 0.7) return 'sync-match--mid';
  return 'sync-match--low';
}

export default function MatchConfidenceBadge({ score }) {
  const cls = confidenceClass(score);
  const label = score == null ? '?' : `${Math.round(score * 100)}%`;
  return <span className={`sync-match ${cls}`}>{label}</span>;
}
