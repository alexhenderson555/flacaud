import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiPostJson = vi.fn();
const apiGetJson = vi.fn();

vi.mock('./apiClient', () => ({
  apiPostJson: (...args) => apiPostJson(...args),
  apiGetJson: (...args) => apiGetJson(...args),
}));

import { cancelJob, fetchJobStatus } from './downloadJobs';

describe('downloadJobs analyzer', () => {
  beforeEach(() => {
    apiPostJson.mockReset();
    apiGetJson.mockReset();
  });

  it('cancelJob posts to cancel endpoint', async () => {
    apiPostJson.mockResolvedValue({ job_id: 'abc', status: 'cancelled' });
    const res = await cancelJob('abc', 'en');
    expect(apiPostJson).toHaveBeenCalledWith('/api/jobs/abc/cancel', {}, { auth: true, lang: 'en' });
    expect(res.status).toBe('cancelled');
  });

  it('fetchJobStatus returns null on error', async () => {
    apiGetJson.mockRejectedValue(new Error('network'));
    expect(await fetchJobStatus('x')).toBeNull();
  });
});
