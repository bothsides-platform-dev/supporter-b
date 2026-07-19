import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Session = { user: { id: string; workspaceId?: string } } | null;
const sessionRef: { value: Session } = { value: null };

vi.mock('@/auth', () => ({ auth: () => Promise.resolve(sessionRef.value) }));
vi.mock('@/lib/auth/session', () => ({
  isSessionRevoked: async () => false,
  isEmailUnverified: async () => false,
}));

import { handleSigningDownload } from '../download-handler';
import {
  __resetContractSigningServiceForTest,
  __setContractSigningServiceForTest,
  type ContractSigningService,
} from '@/lib/server/services/contract-signing';

beforeEach(() => {
  sessionRef.value = { user: { id: 'u1', workspaceId: 'ws1' } };
});
afterEach(() => {
  sessionRef.value = null;
  __resetContractSigningServiceForTest();
});

describe('handleSigningDownload', () => {
  it('401 when unauthenticated', async () => {
    sessionRef.value = null;
    const res = await handleSigningDownload('c1', 'document');
    expect(res.status).toBe(401);
  });

  it('302 redirects to the SnowSign URL for an authorized completed contract', async () => {
    const getDownloadUrl = vi.fn(async () => ({ ok: true as const, url: 'https://s3/x.pdf' }));
    __setContractSigningServiceForTest({ getDownloadUrl } as unknown as ContractSigningService);
    const res = await handleSigningDownload('c1', 'document');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://s3/x.pdf');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(getDownloadUrl).toHaveBeenCalledWith('c1', 'document', {
      userId: 'u1',
      workspaceId: 'ws1',
    });
  });

  it('maps service errors to HTTP status (403 FORBIDDEN, 409 NOT_COMPLETED)', async () => {
    __setContractSigningServiceForTest({
      getDownloadUrl: vi.fn(async () => ({ ok: false as const, error: 'FORBIDDEN' })),
    } as unknown as ContractSigningService);
    expect((await handleSigningDownload('c1', 'document')).status).toBe(403);

    __setContractSigningServiceForTest({
      getDownloadUrl: vi.fn(async () => ({ ok: false as const, error: 'NOT_COMPLETED' })),
    } as unknown as ContractSigningService);
    expect((await handleSigningDownload('c1', 'audit')).status).toBe(409);
  });
});
