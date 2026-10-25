import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { POST } from '../route';

const mocks = vi.hoisted(() => ({ pending: vi.fn(), dispatch: vi.fn() }));
vi.mock('@/lib/server/repositories/factory', () => ({ getGuestRequestRepo: async () => ({ pending: mocks.pending }) }));
vi.mock('@/lib/server/services/guest-requests', () => ({ getGuestRequestService: async () => ({ dispatch: mocks.dispatch }) }));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: vi.fn() } }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CRON_SECRET', 'test-cron-proof');
  vi.stubEnv('GUEST_RFP_AUTO_SEND_ENABLED', 'true');
});
afterEach(() => vi.unstubAllEnvs());
const request = (secret = 'test-cron-proof') => new Request('http://localhost/api/cron/dispatch-guest-rfp', { method: 'POST', headers: { 'x-cron-secret': secret } });
it('requires a configured matching secret before reading waiting requests', async () => {
  expect((await POST(request('wrong'))).status).toBe(401);
  vi.stubEnv('CRON_SECRET', '');
  expect((await POST(request(''))).status).toBe(401);
  expect(mocks.pending).not.toHaveBeenCalled();
});
it('preserves waiting requests while automatic sending is paused', async () => {
  vi.stubEnv('GUEST_RFP_AUTO_SEND_ENABLED', 'false');
  expect(await (await POST(request())).json()).toEqual({ paused: true });
  expect(mocks.pending).not.toHaveBeenCalled();
});
it('continues past a transient failure and reports it for the next cron attempt', async () => {
  mocks.pending.mockResolvedValue([{ id: 'first' }, { id: 'second' }]);
  mocks.dispatch.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(undefined);
  expect(await (await POST(request())).json()).toEqual({ processed: 2, failed: 1 });
  expect(mocks.dispatch.mock.calls).toEqual([['first'], ['second']]);
});
