// sendTeamMessageAction — thin entry: session → zod → TeamChatService →
// best-effort publishTeamChatEvent. ACL/scope contracts live in the service
// tests; here we verify the action wiring (session errors, validation,
// persistence, realtime fanout call).

import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { rfpTeamMessages } from '@/lib/db/schema';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedRfp,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { __resetTeamChatServiceForTest } from '@/lib/server/services/team-chat';
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

describe('sendTeamMessageAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
    __resetTeamChatServiceForTest();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    __resetTeamChatServiceForTest();
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
