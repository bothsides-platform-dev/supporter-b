// sendChatMessageAction + markConversationReadAction.
//
// Conversation model: one row per buyer↔PG workspace pair (RFP-agnostic). PG↔PG
// and buyer↔buyer are impossible by construction — the complete-privacy (비공개)
// invariant. Cold contact (email lookup, no prior RFP link) is allowed with no
// accept gate.
//
// Contract under test (per impl-plan 2026-06-02, §Server Actions):
//   sendChatMessageAction:
//     - buyer & pg both send; side derived from session.user.workspaceType.
//     - resolve by conversationId (membership-checked), or by counterparty
//       workspaceId, or by counterpartyEmail (cold contact).
//     - buyer↔PG type validation: reject same-type counterparty.
//     - conversationId where the session ws is not a member → FORBIDDEN.
//     - persists message + links attachmentIds + touches last_message_at +
//       dispatches in-app notification to each counterparty member + enqueues a
//       windowed-digest outbox row.
//   markConversationReadAction:
//     - upserts last_read_at; FORBIDDEN for a non-member conversation.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { attachments, chatMessages, notifications, outboxEntries } from '@/lib/db/schema';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { setupRfpActionEnv, teardownRfpActionEnv } from '../../rfp/__tests__/_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

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

// Spy the best-effort fanout so we can assert the publish payload shape without
// a live Centrifugo server (the real impl no-ops when env is unconfigured).
const publishChatEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/server/realtime/centrifugo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../realtime/centrifugo')>();
  return { ...actual, publishChatEvent: (...args: unknown[]) => publishChatEvent(...args) };
});

import { sendChatMessageAction } from '../sendChatMessageAction';
import { markConversationReadAction } from '../markConversationReadAction';
import {
  getChatConversationRepo,
  getChatReadRepo,
} from '@/lib/server/repositories/factory';

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

describe('sendChatMessageAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
    publishChatEvent.mockClear();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('publishes a content-bearing live message event so subscribers can append without a refetch', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);

    const r = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: '실시간으로 보여요.',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(publishChatEvent).toHaveBeenCalledTimes(1);
    const [convId, payload] = publishChatEvent.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(convId).toBe(r.conversationId);
    expect(payload).toMatchObject({
      type: 'message',
      id: r.messageId,
      body: '실시간으로 보여요.',
      authorWsId: buyerWs.id,
      rfpId: null,
    });
    // createdAt must be an ISO string a client can map straight to ThreadMessage.
    expect(typeof payload.createdAt).toBe('string');
    expect(Number.isNaN(Date.parse(payload.createdAt as string))).toBe(false);
  });

  it('buyer sends to a PG by counterparty workspace id → creates the pair, persists the message', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);

    const r = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: '안녕하세요, 제안 관련 문의드려요.',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const msgs = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, r.conversationId));
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toBe('안녕하세요, 제안 관련 문의드려요.');
    expect(msgs[0].authorWsId).toBe(buyerWs.id);

    const conv = await (await getChatConversationRepo()).findById(r.conversationId);
    expect(conv!.buyerWsId).toBe(buyerWs.id);
    expect(conv!.pgWsId).toBe(pgWs.id);
    expect(conv!.lastMessageAt).not.toBeNull();
  });

  it('pg sends to a buyer by counterparty workspace id → side derived as pg', async () => {
    const { buyerWs, pgUser, pgWs } = await seedPair();
    asPg(pgUser, pgWs.id);

    const r = await sendChatMessageAction({
      counterpartyWorkspaceId: buyerWs.id,
      body: '제안서 보내드립니다.',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const conv = await (await getChatConversationRepo()).findById(r.conversationId);
    expect(conv!.buyerWsId).toBe(buyerWs.id);
    expect(conv!.pgWsId).toBe(pgWs.id);
  });

  it('cold contact by email resolves the counterparty workspace and sends', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);

    const r = await sendChatMessageAction({
      counterpartyEmail: pgUser.email,
      body: '처음 연락드려요.',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const conv = await (await getChatConversationRepo()).findById(r.conversationId);
    expect(conv!.pgWsId).toBe(pgWs.id);
  });

  it('rejects same-type counterparty (buyer→buyer) — privacy invariant', async () => {
    const { buyerUser, buyerWs } = await seedPair();
    const otherBuyerWs = await seedBuyerWorkspace(db, { name: '다른구매사' });
    asBuyer(buyerUser, buyerWs.id);

    const r = await sendChatMessageAction({
      counterpartyWorkspaceId: otherBuyerWs.id,
      body: 'should fail',
    });
    expect(r).toEqual({ ok: false, error: 'INVALID_COUNTERPARTY' });
  });

  it('rejects same-type counterparty (pg→pg) — PG mutual privacy invariant', async () => {
    const { pgUser, pgWs } = await seedPair();
    const otherPgWs = await seedPgWorkspace(db, 'PG2', { name: '다른PG' });
    asPg(pgUser, pgWs.id);

    const r = await sendChatMessageAction({
      counterpartyWorkspaceId: otherPgWs.id,
      body: 'should fail',
    });
    expect(r).toEqual({ ok: false, error: 'INVALID_COUNTERPARTY' });
  });

  it('FORBIDDEN when the conversationId is not the session workspace pair', async () => {
    const { buyerWs, pgWs } = await seedPair();
    // A conversation between unrelated workspaces.
    const conv = await (await getChatConversationRepo()).findOrCreatePair(
      buyerWs.id,
      pgWs.id,
    );
    // An outsider PG tries to post into it.
    const outsiderWs = await seedPgWorkspace(db, 'OUT', { name: '외부PG' });
    const outsider = await seedUser(db, { email: 'out@pg.com' });
    await seedMembership(db, outsiderWs.id, outsider.id, 'admin');
    asPg(outsider, outsiderWs.id);

    const r = await sendChatMessageAction({
      conversationId: conv.id,
      body: 'intruder',
    });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('dispatches an in-app notification to each counterparty member and enqueues a windowed outbox row', async () => {
    const { buyerUser, buyerWs, pgUser, pgWs } = await seedPair();
    // add a second PG member to confirm fanout
    const pgUser2 = await seedUser(db, { email: 'sales2@pg.com' });
    await seedMembership(db, pgWs.id, pgUser2.id, 'member');
    asBuyer(buyerUser, buyerWs.id);

    const r = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: '확인 부탁드려요.',
    });
    expect(r.ok).toBe(true);

    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.workspaceId, pgWs.id));
    const recipientIds = notifs.map((n) => n.userId).sort();
    expect(recipientIds).toEqual([pgUser.id, pgUser2.id].sort());
    // sender (buyer) must not be notified
    expect(notifs.some((n) => n.userId === buyerUser.id)).toBe(false);

    const outbox = await db.select().from(outboxEntries);
    expect(outbox.length).toBeGreaterThanOrEqual(1);
    expect(outbox[0].event).toBe('chat.message');
    // windowed dedupe key: chat-digest:<conv>:<recipient>:<bucket>
    expect(outbox[0].dedupeKey).toMatch(
      new RegExp(`^chat-digest:${r.ok ? r.conversationId : ''}:[0-9a-f-]+:\\d+$`),
    );
  });

  it('coalesces multiple sends in the same window into one outbox row per recipient', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);

    await sendChatMessageAction({ counterpartyWorkspaceId: pgWs.id, body: 'm1' });
    await sendChatMessageAction({ counterpartyWorkspaceId: pgWs.id, body: 'm2' });
    await sendChatMessageAction({ counterpartyWorkspaceId: pgWs.id, body: 'm3' });

    const outbox = await db.select().from(outboxEntries);
    // one PG member → one coalesced row for the window
    expect(outbox).toHaveLength(1);
  });

  it('links draft attachments to the new message via chat_message_id', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);
    const attId = randomUUID();
    await db.insert(attachments).values({
      id: attId,
      name: 'doc.pdf',
      size: 1234,
      mimeType: 'application/pdf',
      uploadedBy: buyerUser.id,
    });

    const r = await sendChatMessageAction({
      counterpartyWorkspaceId: pgWs.id,
      body: '첨부 확인해주세요.',
      attachmentIds: [attId],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [att] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attId));
    const [msg] = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, r.conversationId));
    expect(att.chatMessageId).toBe(msg.id);
  });

  it('INVALID_INPUT when body is empty and no attachments', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);
    const r = await sendChatMessageAction({ counterpartyWorkspaceId: pgWs.id, body: '' });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });
});

describe('markConversationReadAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('upserts last_read_at for a member of the conversation', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    const conv = await (await getChatConversationRepo()).findOrCreatePair(
      buyerWs.id,
      pgWs.id,
    );
    asBuyer(buyerUser, buyerWs.id);

    const r = await markConversationReadAction({ conversationId: conv.id });
    expect(r.ok).toBe(true);
    const row = await (await getChatReadRepo()).getFor(conv.id, buyerUser.id);
    expect(row).toBeDefined();
  });

  it('FORBIDDEN when the session workspace is not in the conversation', async () => {
    const { buyerWs, pgWs } = await seedPair();
    const conv = await (await getChatConversationRepo()).findOrCreatePair(
      buyerWs.id,
      pgWs.id,
    );
    const outsiderWs = await seedPgWorkspace(db, 'OUT', { name: '외부PG' });
    const outsider = await seedUser(db, { email: 'out@pg.com' });
    await seedMembership(db, outsiderWs.id, outsider.id, 'admin');
    asPg(outsider, outsiderWs.id);

    const r = await markConversationReadAction({ conversationId: conv.id });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});
