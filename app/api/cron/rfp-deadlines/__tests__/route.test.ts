import { beforeEach, describe, expect, it, vi } from 'vitest';

const run = vi.fn();
vi.mock('@/lib/server/services/rfp-deadlines', () => ({ runRfpDeadlineNotices: run }));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: vi.fn() } }));
import { POST } from '../route';

const request = (secret?: string) => new Request('http://localhost/api/cron/rfp-deadlines', {
  method: 'POST', headers: secret ? { 'x-cron-secret': secret } : {},
});

describe('RFP deadlines cron route', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('CRON_SECRET', 'cron-secret'); });
  it('requires the header secret and fails closed when unset', async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request('wrong'))).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await POST(request())).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
  it('runs the worker only for the authenticated caller', async () => {
    run.mockResolvedValue({ processed: 3, notified: 2, failed: 0 });
    const response = await POST(request('cron-secret'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 3, notified: 2, failed: 0 });
  });
});
