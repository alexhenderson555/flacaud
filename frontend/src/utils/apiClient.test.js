import { describe, it, expect } from 'vitest';
import { codeFromBody, detailFromBody, messageForApiError, ApiError } from './apiClient';

describe('apiClient error parsing', () => {
  it('reads structured FastAPI detail', () => {
    const body = { detail: { code: 'stream_failed', message: 'Could not prepare stream' } };
    expect(codeFromBody(body)).toBe('stream_failed');
    expect(detailFromBody(body)).toBe('Could not prepare stream');
  });

  it('maps stream_failed i18n', () => {
    const err = new ApiError('x', { code: 'stream_failed' });
    expect(messageForApiError(err, 'ru')).toContain('воспроизведение');
  });
});
