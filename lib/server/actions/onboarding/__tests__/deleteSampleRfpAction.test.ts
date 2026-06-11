import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OnboardingService,
  __setOnboardingServiceForTest,
  __resetOnboardingServiceForTest,
} from '@/lib/server/services/onboarding';

vi.mock('@/lib/auth/session', () => ({
  requireBuyerSession: vi.fn(async () => ({ user: { id: 'u1', workspaceId: 'ws1' } })),
}));

import { deleteSampleRfpAction } from '../deleteSampleRfpAction';
import { requireBuyerSession } from '@/lib/auth/session';

afterEach(() => {
  __resetOnboardingServiceForTest();
  vi.clearAllMocks();
});

describe('deleteSampleRfpAction', () => {
  it('delegates to OnboardingService.deleteSampleRfp with session actor', async () => {
    const spy = vi.fn(async () => ({ ok: true as const }));
    const fake = Object.assign(Object.create(OnboardingService.prototype), { deleteSampleRfp: spy });
    __setOnboardingServiceForTest(fake);

    const res = await deleteSampleRfpAction({ code: 'P-2606-0001' });
    expect(res).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith('P-2606-0001', { userId: 'u1', workspaceId: 'ws1' });
  });

  it('returns FORBIDDEN_BUYER when session check throws', async () => {
    (requireBuyerSession as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('no'));
    const res = await deleteSampleRfpAction({ code: 'P-2606-0001' });
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN_BUYER' });
  });
});
