import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ revoked: false }));
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: 'u-1', email: 'user@example.com', sessionVersion: 1 } }) }));
vi.mock('@/lib/auth/session', () => ({ isSessionRevoked: async () => state.revoked }));
import { getChannelMember } from '@/lib/channel-io/server';
beforeEach(() => { state.revoked = false; });
it('does not issue a support-chat identity to a revoked session', async () => {
  state.revoked = true;
  expect(await getChannelMember()).toBeNull();
});
it('keeps support available to a valid account', async () => {
  expect(await getChannelMember()).toMatchObject({ memberId: 'u-1' });
});
