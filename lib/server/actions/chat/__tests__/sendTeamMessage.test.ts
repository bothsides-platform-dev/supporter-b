// sendTeamMessageAction — thin entry: session → zod → TeamChatService →
// best-effort publishTeamChatEvent. ACL/scope contracts live in the service
// tests; here we verify the action wiring (session errors, validation,
// persistence, realtime fanout call).

import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { attachments, rfpTeamMessages } from '@/lib/db/schema';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedRfp,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { setupRfpActionEnv, teardownRfpActionEnv } from '../../rfp/__tests__/_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

type SessionUser = {
  id: string;
  email: string;
  workspaceId: string;
  workspaceType: 'buyer' | 'pg';
};
const sessionRef: { value: { user: SessionUser } | null } = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

vi.mock('@/lib/server/realtime/centrifugo', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../realtime/centrifugo')>();
  return {
    ...actual,
    publishTeamChatEvent: vi.fn().mockResolvedValue(undefined),
  };
});

import { publishTeamChatEvent } from '@/lib/server/realtime/centrifugo';
import { sendTeamMessageAction } from '../sendTeamMessageAction';

let db: PgliteDB;

async function seedScene() {
  const buyerUser = await seedUser(db, { email: 'buyer@b.com', name: '김구매' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id });
  return { buyerUser, buyerWs, rfp };
}

function asBuyer(u: { id: string; email: string }, wsId: string) {
  sessionRef.value = {
    user: { id: u.id, email: u.email, workspaceId: wsId, workspaceType: 'buyer' },
  };
}

async function seedDraftAttachment(uploaderId: string, name = 'team.pdf') {
  const id = randomUUID();
  await db.insert(attachments).values({
    id,
    name,
    size: 1024,
    mimeType: 'application/pdf',
    uploadedBy: uploaderId,
  });
  return id;
}

describe('sendTeamMessageAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
    vi.clearAllMocks();
  });

  it('persists the message and publishes a live event to the team channel', async () => {
    const { buyerUser, buyerWs, rfp } = await seedScene();
    asBuyer(buyerUser, buyerWs.id);

    const r = await sendTeamMessageAction({ rfpId: rfp.id, body: '내부 메모' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const rows = await db
      .select()
      .from(rfpTeamMessages)
      .where(eq(rfpTeamMessages.id, r.messageId));
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe('내부 메모');
    expect(rows[0].workspaceId).toBe(buyerWs.id);

    expect(publishTeamChatEvent).toHaveBeenCalledTimes(1);
    const [rfpIdArg, wsIdArg, payload] = vi.mocked(publishTeamChatEvent).mock
      .calls[0];
    expect(rfpIdArg).toBe(rfp.id);
    expect(wsIdArg).toBe(buyerWs.id);
    expect(payload).toMatchObject({
      type: 'message',
      id: r.messageId,
      body: '내부 메모',
      authorUserId: buyerUser.id,
      authorName: '김구매',
    });
  });

  it('rejects a non-uuid rfpId with INVALID_INPUT (no publish)', async () => {
    const { buyerUser, buyerWs } = await seedScene();
    asBuyer(buyerUser, buyerWs.id);

    const r = await sendTeamMessageAction({ rfpId: 'not-a-uuid', body: 'x' });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(publishTeamChatEvent).not.toHaveBeenCalled();
  });

  it('returns UNAUTHENTICATED without a session', async () => {
    sessionRef.value = null;
    const r = await sendTeamMessageAction({ rfpId: randomUUID(), body: 'x' });
    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
  });

  it('body 4000자는 허용, 4001자는 INVALID_INPUT (zod 경계)', async () => {
    const { buyerUser, buyerWs, rfp } = await seedScene();
    asBuyer(buyerUser, buyerWs.id);

    const over = await sendTeamMessageAction({ rfpId: rfp.id, body: 'x'.repeat(4001) });
    expect(over).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(publishTeamChatEvent).not.toHaveBeenCalled();

    const max = await sendTeamMessageAction({ rfpId: rfp.id, body: 'x'.repeat(4000) });
    expect(max.ok).toBe(true);
  });

  it('라이브 팬아웃이 reject 해도 전송은 ok 다 (best-effort — 영속은 이미 완료)', async () => {
    const { buyerUser, buyerWs, rfp } = await seedScene();
    asBuyer(buyerUser, buyerWs.id);
    vi.mocked(publishTeamChatEvent).mockRejectedValueOnce(new Error('centrifugo down'));

    const r = await sendTeamMessageAction({ rfpId: rfp.id, body: '메모' });
    expect(r.ok).toBe(true);
  });

  it('links attachments and includes them in the result + fanout payload', async () => {
    const { buyerUser, buyerWs, rfp } = await seedScene();
    asBuyer(buyerUser, buyerWs.id);
    const a1 = await seedDraftAttachment(buyerUser.id, 'memo.pdf');

    const r = await sendTeamMessageAction({
      rfpId: rfp.id,
      body: '첨부 메모',
      attachmentIds: [a1],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.attachments.map((a) => a.id)).toEqual([a1]);

    const [attRow] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, a1))
      .limit(1);
    expect(attRow.rfpTeamMessageId).toBe(r.messageId);

    const [, , payload] = vi.mocked(publishTeamChatEvent).mock.calls[0];
    expect(
      (payload as { attachments?: { id: string }[] }).attachments?.map((a) => a.id),
    ).toEqual([a1]);
  });

  it('allows an attachment-only message (empty body)', async () => {
    const { buyerUser, buyerWs, rfp } = await seedScene();
    asBuyer(buyerUser, buyerWs.id);
    const a1 = await seedDraftAttachment(buyerUser.id);

    const r = await sendTeamMessageAction({
      rfpId: rfp.id,
      body: '',
      attachmentIds: [a1],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.attachments).toHaveLength(1);
  });

  it('propagates service errors (FORBIDDEN for a non-owning buyer)', async () => {
    const { rfp } = await seedScene();
    const otherUser = await seedUser(db, { email: 'other@b.com' });
    const otherWs = await seedBuyerWorkspace(db);
    await seedMembership(db, otherWs.id, otherUser.id);
    asBuyer(otherUser, otherWs.id);

    const r = await sendTeamMessageAction({ rfpId: rfp.id, body: 'x' });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(publishTeamChatEvent).not.toHaveBeenCalled();
  });
});
