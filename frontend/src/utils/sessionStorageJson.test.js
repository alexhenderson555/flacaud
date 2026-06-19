import { beforeEach, describe, expect, it } from 'vitest';
import { readSessionJson } from './sessionStorageJson';

describe('readSessionJson', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns fallback when missing', () => {
    expect(readSessionJson('missing', null)).toBe(null);
  });

  it('parses valid json', () => {
    sessionStorage.setItem('k', JSON.stringify([1, 2]));
    expect(readSessionJson('k', null)).toEqual([1, 2]);
  });

  it('clears corrupt json', () => {
    sessionStorage.setItem('k', '{bad');
    expect(readSessionJson('k', null)).toBe(null);
    expect(sessionStorage.getItem('k')).toBe(null);
  });
});
