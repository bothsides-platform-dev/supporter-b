import { beforeEach, describe, expect, it, vi } from 'vitest';

const sync = vi.fn();
vi.mock('@/lib/server/services/business-calendar-sync', () => ({ runBusinessCalendarSync: sync }));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { POST } from '../route';

const req = (secret?: string) => new Request('http://localhost/api/cron/sync-business-calendar', {
  method: 'POST', headers: secret === undefined ? {} : { 'x-cron-secret': secret },
});

describe('business calendar cron', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('CRON_SECRET', 'cron-secret'); });

  it('rejects absent and wrong secrets before accessing the calendar', async () => {
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req('wrong'))).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await POST(req(''))).status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });

  it('runs a sync only for the authenticated caller', async () => {
    sync.mockResolvedValue({ years: [2026, 2027], staleYears: [], missingYears: [] });
    const response = await POST(req('cron-secret'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ years: [2026, 2027], staleYears: [], missingYears: [] });
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('returns failure without exposing provider keys', async () => {
    sync.mockRejectedValue(new Error('https://provider/?ServiceKey=secret'));
    const response = await POST(req('cron-secret'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'calendar_sync_failed' });
  });
});
