import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OnboardingService,
  __setOnboardingServiceForTest,
  __resetOnboardingServiceForTest,
} from '@/lib/server/services/onboarding';

vi.mock('@/lib/auth/session', () => ({
  requireBuyerSession: vi.fn(async () => ({ user: { id: 'u1', workspaceId: 'ws1' } })),
  requirePgSession: vi.fn(async () => ({ user: { id: 'u2', workspaceId: 'ws2' } })),
}));

import { updateOnboardingAction } from '../updateOnboardingAction';
import { requireBuyerSession, requirePgSession } from '@/lib/auth/session';

afterEach(() => {
  __resetOnboardingServiceForTest();
  vi.clearAllMocks();
});

describe('updateOnboardingAction', () => {
  it('key=buyerSample delegates to OnboardingService.mark with the buyer actor', async () => {
    const spy = vi.fn(async () => ({ ok: true as const }));
    const fake = Object.assign(Object.create(OnboardingService.prototype), { mark: spy });
    __setOnboardingServiceForTest(fake);

    const res = await updateOnboardingAction({ key: 'buyerSample', event: 'completed' });
    expect(res).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith({ userId: 'u1' }, 'buyerSample', 'completed');
  });

  it('key=pgSample delegates to OnboardingService.mark with the PG actor', async () => {
    const spy = vi.fn(async () => ({ ok: true as const }));
    const fake = Object.assign(Object.create(OnboardingService.prototype), { mark: spy });
    __setOnboardingServiceForTest(fake);

    const res = await updateOnboardingAction({ key: 'pgSample', event: 'dismissed' });
    expect(res).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith({ userId: 'u2' }, 'pgSample', 'dismissed');
  });

  it('unauth (buyer session throws) → FORBIDDEN_BUYER', async () => {
    (requireBuyerSession as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('no'));
    const res = await updateOnboardingAction({ key: 'buyerSample', event: 'completed' });
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN_BUYER' });
  });

  it('wrong workspace type (pg session throws for pgSample) → FORBIDDEN_PG', async () => {
    (requirePgSession as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('no'));
    const res = await updateOnboardingAction({ key: 'pgSample', event: 'completed' });
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN_PG' });
  });

  it('invalid key rejected by zod → INVALID_INPUT', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await updateOnboardingAction({ key: 'bogusKey', event: 'completed' } as any);
    expect(res).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('invalid event rejected by zod → INVALID_INPUT', async () => {
    const res = await updateOnboardingAction({
      key: 'buyerSample',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      event: 'bogusEvent' as any,
    });
    expect(res).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('is idempotent for a second identical call', async () => {
    const spy = vi.fn(async () => ({ ok: true as const }));
    const fake = Object.assign(Object.create(OnboardingService.prototype), { mark: spy });
    __setOnboardingServiceForTest(fake);

    const first = await updateOnboardingAction({ key: 'buyerSample', event: 'completed' });
    const second = await updateOnboardingAction({ key: 'buyerSample', event: 'completed' });
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
