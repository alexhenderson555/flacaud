import { useCallback, useEffect, useState } from 'react';
import { initialLandingLang } from '../content/landingCopy';

export function useLandingLang() {
  const [lang, setLangState] = useState(initialLandingLang);

  const setLang = useCallback((next) => {
    const value = next === 'ru' ? 'ru' : 'en';
    setLangState(value);
    try {
      localStorage.setItem('tidal-lang', value);
    } catch { /* ignore */ }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'ru' ? 'en' : 'ru');
  }, [lang, setLang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return { lang, setLang, toggleLang };
}
