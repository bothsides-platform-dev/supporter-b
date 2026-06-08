import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupRfpActionEnv, teardownRfpActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

const sessionRef: {
  value: {
    user: {
      id: string;
      email: string;
      workspaceId: string;
      workspaceType: 'buyer';
      role: 'admin' | 'member';
    };
  } | null;
} = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('UNAUTHENTICATED'));
    return Promise.resolve(sessionRef.value);
  },
  requireBuyerSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('FORBIDDEN_BUYER'));
    return Promise.resolve(sessionRef.value);
  },
}));

import { awardRfpAction } from '../awardRfpAction';

let db: PgliteDB;

describe('awardRfpAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
    void db;
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('rejects without buyer session', async () => {
    sessionRef.value = null;
    const r = await awardRfpAction({
      rfpId: '00000000-0000-0000-0000-000000000001',
      awardedBidId: '00000000-0000-0000-0000-000000000002',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('FORBIDDEN_BUYER');
  });

  it('rejects INVALID_INPUT when rfpId is not a uuid', async () => {
    sessionRef.value = {
      user: {
        id: '00000000-0000-0000-0000-000000000099',
        email: 'x@x.com',
        workspaceId: '00000000-0000-0000-0000-000000000099',
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await awardRfpAction({
      rfpId: 'not-a-uuid',
      awardedBidId: '00000000-0000-0000-0000-000000000002',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('INVALID_INPUT');
  });
});
