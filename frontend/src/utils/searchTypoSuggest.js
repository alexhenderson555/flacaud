import { suggestSearchCorrection, fixKeyboardLayout } from './searchQueryFix';

/** Damerau–Levenshtein (transpositions) — Google-style edit distance. */
export function damerauLevenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  const max = al + 1;
  const d = Array.from({ length: max }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i += 1) d[i][0] = i;
  for (let j = 0; j <= bl; j += 1) d[0][j] = j;
  for (let i = 1; i <= al; i += 1) {
    for (let j = 1; j <= bl; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }
  return d[al][bl];
}

function maxEditDistance(len) {
  if (len <= 4) return 1;
  if (len <= 8) return 2;
  return 3;
}

function preserveCase(sample, fixed) {
  if (!sample) return fixed;
  if (sample === sample.toLowerCase()) return fixed;
  if (sample === sample.toUpperCase()) return fixed.toUpperCase();
  if (sample[0] === sample[0].toUpperCase()) {
    return fixed.charAt(0).toUpperCase() + fixed.slice(1).toLowerCase();
  }
  return fixed;
}

/** Best dictionary match for a single token. */
export function suggestTokenTypo(token, vocabulary) {
  const raw = token.trim();
  if (raw.length < 3) return null;
  const q = raw.toLowerCase();
  let best = null;
  let bestDist = 99;
  for (const term of vocabulary) {
    const t = term.toLowerCase();
    if (Math.abs(t.length - q.length) > 3) continue;
    const d = damerauLevenshtein(q, t);
    const allowed = maxEditDistance(q.length);
    if (d <= allowed && d < bestDist) {
      bestDist = d;
      best = term;
    }
  }
  if (!best || best.toLowerCase() === q) return null;
  return {
    text: preserveCase(raw, best),
    distance: bestDist,
    confidence: bestDist === 1 ? 'high' : 'medium',
  };
}

/** Fix each word in a multi-word query. */
export function suggestMultiWordTypo(query, vocabulary) {
  const parts = query.trim().split(/\s+/);
  if (parts.length < 2) return null;
  let changed = false;
  const out = parts.map((w) => {
    const hit = suggestTokenTypo(w, vocabulary);
    if (hit?.text && hit.text.toLowerCase() !== w.toLowerCase()) {
      changed = true;
      return hit.text;
    }
    return w;
  });
  if (!changed) return null;
  const joined = out.join(' ');
  return { text: joined, confidence: 'medium', distance: 1 };
}

/** Correct prefix + junk suffix (e.g. shimzadfgfdgd with vocab "Shimza"). */
export function suggestMangledSuffix(query, vocabulary) {
  const raw = query.trim();
  const q = raw.toLowerCase();
  if (q.length < 5 || /\s/.test(q)) return null;
  let best = null;
  let bestLen = 0;
  for (const term of vocabulary) {
    const t = term.toLowerCase();
    if (t.length < 3 || q.length <= t.length) continue;
    const head = q.slice(0, t.length);
    const d = damerauLevenshtein(head, t);
    if (d <= maxEditDistance(t.length) && q.length > t.length && t.length > bestLen) {
      bestLen = t.length;
      best = preserveCase(raw, term);
    }
  }
  return best;
}

export function suggestWholeQueryTypo(query, vocabulary) {
  const raw = query.trim();
  if (raw.length < 4) return null;
  const q = raw.toLowerCase();
  let best = null;
  let bestDist = 99;
  for (const term of vocabulary) {
    const t = term.toLowerCase();
    if (Math.abs(t.length - q.length) > 4) continue;
    const d = damerauLevenshtein(q, t);
    const allowed = maxEditDistance(q.length);
    if (d <= allowed && d < bestDist) {
      bestDist = d;
      best = term;
    }
  }
  if (!best || best.toLowerCase() === q) return null;
  return {
    text: preserveCase(raw, best),
    distance: bestDist,
    confidence: bestDist === 1 ? 'high' : 'medium',
  };
}

/**
 * Google-style suggestion: keyboard layout → spelling → per-word fixes.
 * @returns {{ text: string, kind: 'layout'|'typo', autoApply: boolean, confidence: number } | null}
 */
export function getSmartSearchSuggestion(query, { vocabulary = [] } = {}) {
  if (!query?.trim()) return null;
  const trimmed = query.trim();
  const vocab = vocabulary.length ? vocabulary : [];

  if (vocab.length) {
    const layoutFixed = fixKeyboardLayout(trimmed);
    if (layoutFixed !== trimmed) {
      const vocabHit =
        suggestWholeQueryTypo(layoutFixed, vocab) ||
        suggestMultiWordTypo(layoutFixed, vocab);
      if (vocabHit?.text) {
        return { text: vocabHit.text, kind: 'layout', autoApply: true, confidence: 1 };
      }
    }
  }

  const layout = suggestSearchCorrection(trimmed);
  if (layout && layout !== trimmed) {
    const spelled =
      suggestWholeQueryTypo(layout, vocab)?.text ||
      suggestMultiWordTypo(layout, vocab)?.text;
    const text = spelled || layout;
    return { text, kind: 'layout', autoApply: true, confidence: 1 };
  }

  const mangled = suggestMangledSuffix(trimmed, vocab);
  if (mangled) {
    return {
      text: mangled,
      kind: 'typo',
      autoApply: false,
      confidence: 0.8,
    };
  }

  const whole = suggestWholeQueryTypo(trimmed, vocab);
  if (whole?.text) {
    const singleToken = !/\s/.test(trimmed);
    const autoApply = singleToken && whole.distance <= 2;
    return {
      text: whole.text,
      kind: 'typo',
      autoApply,
      confidence: whole.distance === 1 ? 0.9 : 0.75,
    };
  }

  const multi = suggestMultiWordTypo(trimmed, vocab);
  if (multi?.text) {
    return {
      text: multi.text,
      kind: 'typo',
      autoApply: false,
      confidence: 0.7,
    };
  }

  return null;
}

/** Quick inline hint while typing (no auto-apply). */
export function getInlineSearchHint(query, options) {
  const s = getSmartSearchSuggestion(query, options);
  if (!s) return null;
  return s.text;
}

export { fixKeyboardLayout, suggestSearchCorrection };
