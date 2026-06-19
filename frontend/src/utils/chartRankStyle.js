/** Top-tracks chart rank: gold / silver / bronze for 1–3. */
export function chartRankClass(rank) {
  if (rank === 1) return 'track-row__rank--gold';
  if (rank === 2) return 'track-row__rank--silver';
  if (rank === 3) return 'track-row__rank--bronze';
  return '';
}
