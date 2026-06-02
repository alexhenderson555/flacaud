/** Latin ↔ Cyrillic keyboard layout (QWERTY ↔ ЙЦУКЕН). */
const EN = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./";
const RU = "ёйцукенгшщзхъфывапролджэячсмитьбю.";
const EN_SHIFT = '~QWERTYUIOP{}ASDFGHJKL:"ZXCVBNM<>?';
const RU_SHIFT = 'Ё!"№;%:?*()_+ЙЦУКЕНГШЩЗХЪ/ФЫВАПРОЛДЖЭ,ЯЧСМИТЬБЮ.';

function swapLayout(text, from, to, fromShift, toShift) {
  let out = '';
  for (const ch of text) {
    let idx = from.indexOf(ch);
    if (idx >= 0) {
      out += to[idx] || ch;
      continue;
    }
    idx = fromShift.indexOf(ch);
    if (idx >= 0) {
      out += toShift[idx] || ch;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Convert typed-as-wrong-layout query to the intended script. */
export function fixKeyboardLayout(query) {
  if (!query || !query.trim()) return query;
  const hasCyrillic = /[а-яА-ЯёЁ]/.test(query);
  const hasLatin = /[a-zA-Z]/.test(query);
  if (hasCyrillic && hasLatin) return query;
  if (hasCyrillic) {
    return swapLayout(query, RU, EN, RU_SHIFT, EN_SHIFT);
  }
  if (hasLatin) {
    return swapLayout(query, EN, RU, EN_SHIFT, RU_SHIFT);
  }
  return query;
}

/** Suggest correction when layout swap yields a different meaningful string. */
export function suggestSearchCorrection(query) {
  if (!query || query.length < 2) return null;
  const fixed = fixKeyboardLayout(query);
  if (fixed === query) return null;
  const origCyr = /[а-яА-ЯёЁ]/.test(query);
  const fixedCyr = /[а-яА-ЯёЁ]/.test(fixed);
  if (origCyr !== fixedCyr) return fixed;
  return null;
}
