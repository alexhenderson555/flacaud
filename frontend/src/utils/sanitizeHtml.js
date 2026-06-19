/** Allowlisted HTML sanitizer for untrusted rich text (e.g. Wikipedia extracts). */

const ALLOWED_TAGS = new Set(['P', 'B', 'I', 'EM', 'STRONG', 'A', 'BR', 'SUP', 'SUB', 'SPAN', 'UL', 'OL', 'LI']);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META']);
const ALLOWED_ATTRS = {
  A: ['href', 'title'],
};

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function isSafeHref(href) {
  try {
    const u = new URL(href, 'https://example.invalid');
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function cleanNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const tag = node.nodeName;
  if (DROP_TAGS.has(tag)) {
    return '';
  }
  if (!ALLOWED_TAGS.has(tag)) {
    return Array.from(node.childNodes).map(cleanNode).join('');
  }

  const allowed = ALLOWED_ATTRS[tag] || [];
  const attrs = Array.from(node.attributes)
    .filter((a) => allowed.includes(a.name.toLowerCase()))
    .map((a) => {
      if (tag === 'A' && a.name.toLowerCase() === 'href' && !isSafeHref(a.value)) {
        return '';
      }
      return `${a.name.toLowerCase()}="${escapeAttr(a.value)}"`;
    })
    .filter(Boolean)
    .join(' ');

  const inner = Array.from(node.childNodes).map(cleanNode).join('');
  const open = attrs ? `<${tag.toLowerCase()} ${attrs}>` : `<${tag.toLowerCase()}>`;
  return tag === 'BR' ? '<br>' : `${open}${inner}</${tag.toLowerCase()}>`;
}

/**
 * @param {string} html
 * @returns {string}
 */
export function sanitizeWikipediaHtml(html) {
  if (!html || typeof html !== 'string') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.body.childNodes).map(cleanNode).join('');
}
