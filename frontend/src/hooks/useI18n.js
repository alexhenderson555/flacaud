import { useCallback, useEffect } from 'react';
import { appDict } from '../locales/appDict';

export function useI18n(lang) {
  useEffect(() => {
    localStorage.setItem('tidal-lang', lang);
  }, [lang]);

  const t = useCallback((key) => appDict[lang]?.[key] || appDict.en[key] || key, [lang]);

  return { t };
}
