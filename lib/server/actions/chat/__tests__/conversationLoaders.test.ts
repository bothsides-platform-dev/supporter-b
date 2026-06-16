// Inbox + thread loaders — workspace-membership filtered.
//
// Contract under test (per impl-plan 2026-06-02, §Server Actions 인박스/스레드):
//   listConversationsForViewer():
//     - buyer viewer → conversations where buyer_ws_id = my workspace;
//       pg viewer → pg_ws_id = my workspace. Never leaks the other side.
//     - each row hydrates the counterparty workspace name/type, last message
//       preview, and an unread flag (last_message_at > my last_read_at).
//     - sorted by last_message_at desc.
//   loadConversationThread(conversationId):
//     - FORBIDDEN for a non-member; otherwise messages asc with a `self` flag
//       derived from author_ws_id === my workspace.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedRfp,
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
import { markConversationReadAction } from '../markConversationReadAction';
import {
  listConversationsForViewer,
  loadConversationThread,
} from '../conversationLoaders';

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

describe('listConversationsForViewer', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('buyer sees the PG counterparty; the row hydrates name, type, preview, unread', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs } = await seedPair();
    // PG sends to buyer → unread for buyer.
    asPg(pgUser, pgWs.id);
    await sendChatMessageAction({ counterpartyWorkspaceId: buyerWs.id, body: '제안 보냅니다.' });

    asBuyer(buyerUser, buyerWs.id);
    const list = await listConversationsForViewer();
    expect(list).toHaveLength(1);
    expect(list[0].counterparty.name).toBe('OO페이');
    expect(list[0].counterparty.type).toBe('pg');
    expect(list[0].preview).toBe('제안 보냅니다.');
    expect(list[0].unread).toBe(true);
  });

  it('unread clears after markConversationRead', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs } = await seedPair();
    asPg(pgUser, pgWs.id);
    const sent = await sendChatMessageAction({
      counterpartyWorkspaceId: buyerWs.id,
      body: 'hi',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    asBuyer(buyerUser, buyerWs.id);
    await markConversationReadAction({ conversationId: sent.conversationId });
    const list = await listConversationsForViewer();
    expect(list[0].unread).toBe(false);
  });

  it('does not leak the buyer side to a pg viewer of an unrelated workspace', async () => {
    const { buyerWs, pgUser, pgWs } = await seedPair();
    asPg(pgUser, pgWs.id);
    await sendChatMessageAction({ counterpartyWorkspaceId: buyerWs.id, body: 'x' });

    // an unrelated PG sees nothing
    const otherPgUser = await seedUser(db, { email: 'o@pg.com' });
    const otherPgWs = await seedPgWorkspace(db, 'PG2', { name: '다른PG' });
    await seedMembership(db, otherPgWs.id, otherPgUser.id, 'admin');
    asPg(otherPgUser, otherPgWs.id);
    expect(await listConversationsForViewer()).toEqual([]);
  });
});

describe('loadConversationThread', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('returns messages asc with self derived from the viewer workspace', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);
    const sent = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: 'buyer says hi',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    asPg(pgUser, pgWs.id);
    await sendChatMessageAction({ conversationId: sent.conversationId, body: 'pg replies' });

    asBuyer(buyerUser, buyerWs.id);
    const thread = await loadConversationThread(sent.conversationId);
    expect(thread.ok).toBe(true);
    if (!thread.ok) return;
    expect(thread.messages.map((m) => m.body)).toEqual(['buyer says hi', 'pg replies']);
    expect(thread.messages.map((m) => m.sender)).toEqual(['self', 'other']);
  });

  it('FORBIDDEN for a non-member viewer', async () => {
    const { buyerWs, pgUser, pgWs } = await seedPair();
    asPg(pgUser, pgWs.id);
    const sent = await sendChatMessageAction({
      counterpartyWorkspaceId: buyerWs.id,
      body: 'hi',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const outsider = await seedUser(db, { email: 'out@pg.com' });
    const outsiderWs = await seedPgWorkspace(db, 'OUT', { name: '외부PG' });
    await seedMembership(db, outsiderWs.id, outsider.id, 'admin');
    asPg(outsider, outsiderWs.id);
    const thread = await loadConversationThread(sent.conversationId);
    expect(thread).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('readByCounterparty is true for my message once the counterparty has read it', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs } = await seedPair();
    // buyer sends, then pg reads → pg's last_read_at >= the message.
    asBuyer(buyerUser, buyerWs.id);
    const sent = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: 'buyer says hi',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    asPg(pgUser, pgWs.id);
    await markConversationReadAction({ conversationId: sent.conversationId });

    asBuyer(buyerUser, buyerWs.id);
    const thread = await loadConversationThread(sent.conversationId);
    expect(thread.ok).toBe(true);
    if (!thread.ok) return;
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0].sender).toBe('self');
    expect(thread.messages[0].readByCounterparty).toBe(true);
  });

  it('readByCounterparty is false for my message the counterparty has not yet read', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    // buyer sends; pg never reads.
    asBuyer(buyerUser, buyerWs.id);
    const sent = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: 'buyer says hi',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const thread = await loadConversationThread(sent.conversationId);
    expect(thread.ok).toBe(true);
    if (!thread.ok) return;
    expect(thread.messages[0].readByCounterparty).toBe(false);
  });

  it("readByCounterparty is false for a message the counterparty sent (it's the viewer's own read, not the counterparty's)", async () => {
    const { buyerUser, buyerWs, pgUser, pgWs } = await seedPair();
    // pg sends to buyer; buyer reads it. The pg-authored message is `other`,
    // so readByCounterparty must stay false — the viewer's own read doesn't count.
    asPg(pgUser, pgWs.id);
    const sent = await sendChatMessageAction({
      counterpartyWorkspaceId: buyerWs.id,
      body: 'pg says hi',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    asBuyer(buyerUser, buyerWs.id);
    await markConversationReadAction({ conversationId: sent.conversationId });
    const thread = await loadConversationThread(sent.conversationId);
    expect(thread.ok).toBe(true);
    if (!thread.ok) return;
    expect(thread.messages[0].sender).toBe('other');
    expect(thread.messages[0].readByCounterparty).toBe(false);
  });

  it('messages without attachments have attachments: []', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);
    const sent = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: 'no attachments here',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const thread = await loadConversationThread(sent.conversationId);
    expect(thread.ok).toBe(true);
    if (!thread.ok) return;
    expect(thread.messages[0].attachments).toEqual([]);
  });

  it('messages with attachments include attachment data', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);

    // Insert a draft attachment (uploaded by the session user, no chatMessageId).
    const attId = randomUUID();
    await db.insert(attachments).values({
      id: attId,
      name: 'spec.pdf',
      size: 2048,
      mimeType: 'application/pdf',
      uploadedBy: buyerUser.id,
    });

    const sent = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: 'with attachment',
      attachmentIds: [attId],
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const thread = await loadConversationThread(sent.conversationId);
    expect(thread.ok).toBe(true);
    if (!thread.ok) return;
    const msg = thread.messages[0];
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0].name).toBe('spec.pdf');
    expect(msg.attachments[0].url).toBe(`/api/files/${attId}`);
  });

  it('attaches author identity to both sides and returns the viewer', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);
    const sent = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: 'buyer says hi',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    asPg(pgUser, pgWs.id);
    await sendChatMessageAction({ conversationId: sent.conversationId, body: 'pg replies' });

    asBuyer(buyerUser, buyerWs.id);
    const thread = await loadConversationThread(sent.conversationId);
    expect(thread.ok).toBe(true);
    if (!thread.ok) return;

    expect(thread.messages.map((m) => m.authorUserId)).toEqual([buyerUser.id, pgUser.id]);
    expect(thread.messages.map((m) => m.authorName)).toEqual(['구매사담당', 'PG영업']);
    expect(thread.messages.map((m) => m.authorEmail)).toEqual(['buyer@b.com', 'sales@pg.com']);
    expect(thread.viewer).toEqual({ userId: buyerUser.id, name: '구매사담당' });
  });

  it('loadConversationThread returns rfpById map for rfpIds present in the thread', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    // Seed an RFP owned by the buyer workspace.
    const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id });
    asBuyer(buyerUser, buyerWs.id);
    const sent = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: 'RFP 관련 메시지',
      rfpId: rfp.id,
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const thread = await loadConversationThread(sent.conversationId);
    expect(thread.ok).toBe(true);
    if (!thread.ok) return;
    expect(thread.rfpById[rfp.id]).toEqual({ code: rfp.code, title: 'RFP' });
  });

  it('a co-member of the viewer workspace reading does NOT flip readByCounterparty (only the counterparty workspace counts)', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    // Second buyer member joins the viewer's OWN workspace.
    const buyerUser2 = await seedUser(db, { email: 'buyer2@b.com', name: '구매사담당2' });
    await seedMembership(db, buyerWs.id, buyerUser2.id, 'member');

    asBuyer(buyerUser, buyerWs.id);
    const sent = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: 'buyer says hi',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    // The OTHER buyer member reads — but the PG side never has.
    asBuyer(buyerUser2, buyerWs.id);
    await markConversationReadAction({ conversationId: sent.conversationId });

    asBuyer(buyerUser, buyerWs.id);
    const thread = await loadConversationThread(sent.conversationId);
    expect(thread.ok).toBe(true);
    if (!thread.ok) return;
    expect(thread.messages[0].readByCounterparty).toBe(false);
  });
});
