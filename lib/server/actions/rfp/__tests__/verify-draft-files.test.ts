import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { attachments } from '@/lib/db/schema';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { setupRfpActionEnv, teardownRfpActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { verifyDraftFilesAction } from '../verifyDraftFilesAction';

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
  requireBuyerSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('UNAUTHENTICATED'));
    return Promise.resolve(sessionRef.value);
  },
}));

let db: PgliteDB;

beforeEach(async () => {
  db = await setupRfpActionEnv();
});

afterEach(async () => {
  sessionRef.value = null;
  await teardownRfpActionEnv();
});

async function seedBuyerSession() {
  const ws = await seedBuyerWorkspace(db);
  const user = await seedUser(db);
  await seedMembership(db, ws.id, user.id, 'admin');
  sessionRef.value = {
    user: { id: user.id, email: user.email, workspaceId: ws.id, workspaceType: 'buyer', role: 'admin' },
  };
  return { ws, user };
}

describe('verifyDraftFilesAction', () => {
  it('빈 배열 입력 시 validIds 빈 배열을 반환한다', async () => {
    await seedBuyerSession();
    const result = await verifyDraftFilesAction([]);
    expect(result).toEqual({ validIds: [] });
  });

  it('DB에 존재하는 unclaimed 파일 ID만 validIds에 포함한다', async () => {
    const { user } = await seedBuyerSession();

    const validId = randomUUID();
    const staleId = randomUUID(); // DB에 없음 — sweep으로 삭제된 상태

    await db.insert(attachments).values({
      id: validId,
      name: 'valid.pdf',
      size: 1024,
      mimeType: 'application/pdf',
      uploadedBy: user.id,
    });

    const result = await verifyDraftFilesAction([validId, staleId]);
    expect(result.validIds).toEqual([validId]);
  });

  it('DB에 없는 파일 ID는 validIds에서 제외한다', async () => {
    await seedBuyerSession();
    const nonExistentId = randomUUID();
    const result = await verifyDraftFilesAction([nonExistentId]);
    expect(result.validIds).toEqual([]);
  });

  it('인증되지 않은 세션이면 validIds 빈 배열을 반환한다', async () => {
    sessionRef.value = null;
    const result = await verifyDraftFilesAction(['some-id']);
    expect(result).toEqual({ validIds: [] });
  });
});
