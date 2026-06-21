import { describe, it, expect } from 'vitest';
import { buildTelegramErrorUrl, errorSupportCopy } from './errorSupport';

describe('errorSupport', () => {
  it('builds telegram url with Russian intro and error text', () => {
    const url = buildTelegramErrorUrl(new Error('boom'), { pageUrl: 'https://flacaud.ru/sync' });
    expect(url).toContain('https://t.me/alexhenderson?text=');
    const decoded = decodeURIComponent(url.split('?text=')[1]);
    expect(decoded).toContain('Привет! Я столкнулся с ошибкой на FlacAud');
    expect(decoded).toContain('https://flacaud.ru/sync');
    expect(decoded).toContain('boom');
  });

  it('returns ru copy', () => {
    expect(errorSupportCopy('ru').reload).toBe('Перезагрузить');
  });
});
