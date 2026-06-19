import { describe, expect, it } from 'vitest';
import { isGuestRoute } from './guestRoutes';

describe('isGuestRoute', () => {
  it('allows browse routes without login', () => {
    expect(isGuestRoute('/')).toBe(true);
    expect(isGuestRoute('/landing')).toBe(true);
    expect(isGuestRoute('/search')).toBe(true);
    expect(isGuestRoute('/recommendations')).toBe(true);
    expect(isGuestRoute('/radio')).toBe(true);
    expect(isGuestRoute('/account')).toBe(true);
    expect(isGuestRoute('/artist/123')).toBe(true);
    expect(isGuestRoute('/album/456')).toBe(true);
  });

  it('allows sync preview for guests', () => {
    expect(isGuestRoute('/sync')).toBe(true);
  });

  it('blocks library and tools for guests', () => {
    expect(isGuestRoute('/library')).toBe(false);
    expect(isGuestRoute('/analyzer')).toBe(false);
  });
});
