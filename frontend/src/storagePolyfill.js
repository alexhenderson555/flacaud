try {
  const _test = '__test__';
  window.localStorage.setItem(_test, _test);
  window.localStorage.removeItem(_test);
} catch (e) {
  const createMemoryStorage = () => {
    let store = {};
    return {
      getItem: (k) => store[String(k)] || null,
      setItem: (k, v) => { store[String(k)] = String(v); },
      removeItem: (k) => { delete store[String(k)]; },
      clear: () => { store = {}; },
      get length() { return Object.keys(store).length; },
      key: (i) => Object.keys(store)[i] || null,
    };
  };
  const memLocal = createMemoryStorage();
  const memSession = createMemoryStorage();
  Object.defineProperty(window, 'localStorage', { value: memLocal, configurable: true, enumerable: true, writable: true });
  Object.defineProperty(window, 'sessionStorage', { value: memSession, configurable: true, enumerable: true, writable: true });
  console.warn('Storage access denied (incognito/cookies blocked). Using in-memory polyfill.');
}
