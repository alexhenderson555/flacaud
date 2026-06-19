// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { sanitizeWikipediaHtml } from './sanitizeHtml';

describe('sanitizeWikipediaHtml', () => {
  it('keeps safe paragraph markup', () => {
    expect(sanitizeWikipediaHtml('<p>Hello <b>world</b></p>')).toBe('<p>Hello <b>world</b></p>');
  });

  it('strips script tags and event handlers', () => {
    const dirty = '<p onclick="alert(1)">x</p><script>alert(1)</script>';
    expect(sanitizeWikipediaHtml(dirty)).toBe('<p>x</p>');
  });

  it('drops unsafe link schemes', () => {
    expect(sanitizeWikipediaHtml('<a href="javascript:alert(1)">bad</a>')).toBe('<a>bad</a>');
    expect(sanitizeWikipediaHtml('<a href="https://en.wikipedia.org/wiki/Foo">ok</a>')).toContain('href="https://en.wikipedia.org/wiki/Foo"');
  });
});
