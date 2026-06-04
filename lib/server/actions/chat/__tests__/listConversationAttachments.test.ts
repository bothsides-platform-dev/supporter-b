// listConversationAttachments — 대화 전체 첨부파일 조회
//
// Contract:
//   - 요청자 워크스페이스가 대화에 속하면 전체 첨부파일 반환 (uploadedAt asc)
//   - 타인 대화 접근 시 [] 반환
//   - 미인증 시 [] 반환

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { setupRfpActionEnv, teardownRfpActionEnv } from '../../rfp/__tests__/_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { attachments } from '@/lib/db/schema';

type SessionUser = {
  id: string;
  email: string;
  workspaceId: string;
  workspaceType: 'buyer' | 'pg';
  role: 'admin' | 'member';
};
const sessionRef: { value: { user: SessionUser } | null } = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
  requireBuyerSession: () =>
    sessionRef.value?.user.workspaceType === 'buyer'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_BUYER')),
  requirePgSession: () =>
    sessionRef.value?.user.workspaceType === 'pg'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_PG')),
}));

import { sendChatMessageAction } from '../sendChatMessageAction';
import { listConversationAttachments } from '../listConversationAttachments';

let db: PgliteDB;

async function seedPair() {
  const buyerUser = await seedUser(db, { email: 'buyer@b.com', name: '구매사담당' });
  const buyerWs = await seedBuyerWorkspace(db, { name: '구매사' });
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
  const pgUser = await seedUser(db, { email: 'sales@pg.com', name: 'PG영업' });
  const pgWs = await seedPgWorkspace(db, 'PG', { name: 'OO페이' });
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');
  return { buyerUser, buyerWs, pgUser, pgWs };
}

function asBuyer(u: { id: string; email: string }, wsId: string) {
  sessionRef.value = {
    user: { id: u.id, email: u.email, workspaceId: wsId, workspaceType: 'buyer', role: 'admin' },
  };
}

function asPg(u: { id: string; email: string }, wsId: string) {
  sessionRef.value = {
    user: { id: u.id, email: u.email, workspaceId: wsId, workspaceType: 'pg', role: 'admin' },
  };
}

describe('listConversationAttachments', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('returns [] for a conversation with no attachments', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);
    const sent = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: 'no files',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const files = await listConversationAttachments(sent.conversationId);
    expect(files).toEqual([]);
  });

  it('returns all attachments across messages, oldest first', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);

    // First message with one attachment.
    const att1 = randomUUID();
    await db.insert(attachments).values({
      id: att1,
      name: 'first.pdf',
      size: 1024,
      mimeType: 'application/pdf',
      uploadedBy: buyerUser.id,
      uploadedAt: new Date('2026-06-01T00:00:00Z'),
    });
    const sent1 = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: 'msg1',
      attachmentIds: [att1],
    });
    expect(sent1.ok).toBe(true);
    if (!sent1.ok) return;

    // Second message with one attachment.
    const att2 = randomUUID();
    await db.insert(attachments).values({
      id: att2,
      name: 'second.pdf',
      size: 2048,
      mimeType: 'application/pdf',
      uploadedBy: buyerUser.id,
      uploadedAt: new Date('2026-06-02T00:00:00Z'),
    });
    await sendChatMessageAction({
      conversationId: sent1.ok ? sent1.conversationId : '',
      body: 'msg2',
      attachmentIds: [att2],
    });

    const files = await listConversationAttachments(sent1.conversationId);
    expect(files.map((f) => f.id)).toEqual([att1, att2]);
    expect(files.map((f) => f.name)).toEqual(['first.pdf', 'second.pdf']);
    expect(files[0].url).toBe(`/api/files/${att1}`);
  });

  it('returns [] when the session workspace does not belong to the conversation', async () => {
    const { buyerWs, pgUser, pgWs } = await seedPair();
    asPg(pgUser, pgWs.id);
    const sent = await sendChatMessageAction({
      counterpartyWorkspaceId: buyerWs.id,
      body: 'hi',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    // An unrelated PG tries to access.
    const outsider = await seedUser(db, { email: 'out@pg.com' });
    const outsiderWs = await seedPgWorkspace(db, 'OUT', { name: '외부PG' });
    await seedMembership(db, outsiderWs.id, outsider.id, 'admin');
    asPg(outsider, outsiderWs.id);

    const files = await listConversationAttachments(sent.conversationId);
    expect(files).toEqual([]);
  });

  it('returns [] when unauthenticated', async () => {
    sessionRef.value = null;
    const files = await listConversationAttachments(randomUUID());
    expect(files).toEqual([]);
  });
});
