import { TELEGRAM_CONTACT_URL } from '../constants/supportLinks';
import { isChunkLoadError } from './chunkRecovery';

export function detectUiLang() {
  try {
    const stored = localStorage.getItem('tidal-lang');
    if (stored === 'ru' || stored === 'en') return stored;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  return nav?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

const COPY = {
  ru: {
    title: 'Что-то пошло не так',
    chunkTitle: 'Нужно обновить страницу',
    chunkBody:
      'Похоже, в браузере осталась старая версия FlacAud после обновления. Перезагрузите вкладку — обычно этого достаточно.',
    body:
      'Произошла непредвиденная ошибка. Перезагрузите страницу или напишите в поддержку — мы поможем разобраться.',
    telegram: 'Написать в Telegram',
    reload: 'Перезагрузить',
    home: 'На главную',
    details: 'Подробности',
  },
  en: {
    title: 'Something went wrong',
    chunkTitle: 'Please refresh the page',
    chunkBody:
      'Your browser may still be running an older FlacAud build after an update. Reload this tab — that usually fixes it.',
    body:
      'An unexpected error occurred. Reload the page or message us on Telegram — we will help you sort it out.',
    telegram: 'Message on Telegram',
    reload: 'Reload',
    home: 'Home',
    details: 'Details',
  },
};

export function errorSupportCopy(lang) {
  return COPY[lang === 'ru' ? 'ru' : 'en'];
}

export function buildTelegramErrorUrl(error, { pageUrl } = {}) {
  const msg = (error?.message || String(error || 'unknown')).slice(0, 500);
  const stack = (error?.stack || '').split('\n').slice(0, 8).join('\n').slice(0, 1800);
  const href = pageUrl || (typeof window !== 'undefined' ? window.location.href : '');
  const text = [
    'Привет! Я столкнулся с ошибкой на FlacAud',
    '',
    `URL: ${href}`,
    `Error: ${msg}`,
    stack ? `\n${stack}` : '',
  ].join('\n').trim();
  const base = TELEGRAM_CONTACT_URL.split('?')[0];
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function isChunkError(error) {
  return isChunkLoadError(error);
}
