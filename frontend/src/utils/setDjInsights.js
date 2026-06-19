/** DJ insights for analyzed sets — BPM curve, Camelot transitions, key spread. */

export function getHarmonicMatches(key) {
  const match = String(key || '').match(/(\d+)([AB])/i);
  if (!match) return key ? [String(key).toUpperCase()] : [];
  const n = parseInt(match[1], 10);
  const letter = match[2].toUpperCase();
  const other = letter === 'A' ? 'B' : 'A';
  const nextN = n === 12 ? 1 : n + 1;
  const prevN = n === 1 ? 12 : n - 1;
  return [`${n}${letter}`, `${nextN}${letter}`, `${prevN}${letter}`, `${n}${other}`];
}

export function transitionQuality(fromKey, toKey, fromBpm, toBpm) {
  if (!fromKey || !toKey) return 'unknown';
  const harmonic = getHarmonicMatches(fromKey);
  const sameKey = fromKey.toUpperCase() === toKey.toUpperCase();
  const harmonicOk = harmonic.includes(toKey.toUpperCase());
  const bpmDelta = Math.abs((fromBpm || 0) - (toBpm || 0));
  if (sameKey && bpmDelta <= 3) return 'smooth';
  if (harmonicOk && bpmDelta <= 6) return 'good';
  if (harmonicOk) return 'key-ok';
  if (bpmDelta <= 4) return 'bpm-ok';
  return 'risky';
}

const QUALITY_RANK = { smooth: 0, good: 1, 'key-ok': 2, 'bpm-ok': 3, risky: 4, unknown: 5 };

export function buildSetDjInsights(rows, resolveFeatures) {
  const entries = (rows || [])
    .map((row, index) => {
      const track = row?.matched_track;
      if (!track?.provider_id) return null;
      const feat = resolveFeatures(row);
      if (!feat?.camelotKey || feat.analyzed === false) return null;
      return {
        index,
        timestamp: row.timestamp,
        title: row.title || track.title,
        bpm: Math.round(Number(feat.bpm) || 0),
        camelotKey: String(feat.camelotKey).toUpperCase(),
      };
    })
    .filter(Boolean);

  const transitions = [];
  for (let i = 0; i < entries.length - 1; i += 1) {
    const a = entries[i];
    const b = entries[i + 1];
    const quality = transitionQuality(a.camelotKey, b.camelotKey, a.bpm, b.bpm);
    transitions.push({
      from: a,
      to: b,
      quality,
      label: `${a.camelotKey} → ${b.camelotKey}`,
    });
  }

  const keyCounts = entries.reduce((acc, e) => {
    acc[e.camelotKey] = (acc[e.camelotKey] || 0) + 1;
    return acc;
  }, {});

  const bpms = entries.map((e) => e.bpm).filter((n) => n > 0);
  const avgBpm = bpms.length
    ? Math.round(bpms.reduce((s, n) => s + n, 0) / bpms.length)
    : null;

  const highlight = transitions.length
    ? [...transitions].sort((x, y) => QUALITY_RANK[x.quality] - QUALITY_RANK[y.quality])[0]
    : null;

  const risky = transitions.filter((t) => t.quality === 'risky');

  return {
    analyzedCount: entries.length,
    totalMatched: (rows || []).filter((r) => r?.matched_track?.provider_id).length,
    avgBpm,
    bpmSeries: entries,
    keyCounts,
    transitions,
    highlight,
    riskyCount: risky.length,
    hasData: entries.length >= 2,
  };
}
