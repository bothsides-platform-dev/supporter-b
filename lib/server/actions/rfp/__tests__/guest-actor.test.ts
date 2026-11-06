import { expect, it, vi } from 'vitest';
vi.mock('@/lib/server/actions/_session', () => ({
  requireBuyerActor: async () => ({
    ok: true,
    userId: 'user',
    workspaceId: 'workspace',
  }),
}));
vi.mock('@/lib/server/services/rfp', () => ({
  getRfpService: () => {
    throw new Error('must not reach service');
  },
}));
import { createRfpAction } from '../createRfpAction';
import type { CreateRfpInput } from '@/lib/rfp/intake/schema';
it('rejects a resumed draft after account or workspace changes before any creation', async () => {
  for (const owner of [
    { userId: 'other', workspaceId: 'workspace' },
    { userId: 'user', workspaceId: 'other' },
  ]) {
    expect(await createRfpAction({} as CreateRfpInput, owner)).toEqual({
      ok: false,
      error: 'WORKSPACE_CHANGED',
    });
  }
});
