// loadTeamThread — RSC/rail loader for the (rfp, session-workspace) internal
// thread. Returns workspaceId (the client needs it to assemble the Centrifugo
// channel name) and messages with isSelf derived from the session user.

import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  seedBuyerWorkspace,
  seedMembership,
  seedRfp,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { eq } from 'drizzle-orm';
import { attachments, rfpTeamMessages, users } from '@/lib/db/schema';
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

import { loadTeamThread } from '../teamThreadLoader';

let db: PgliteDB;

describe('loadTeamThread', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('returns own-scope messages with isSelf and the session workspaceId', async () => {
    const me = await seedUser(db, { email: 'me@b.com', name: '김구매' });
    const teammate = await seedUser(db, { email: 'mate@b.com', name: '이동료' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, me.id, 'admin');
    await seedMembership(db, ws.id, teammate.id);
    const rfp = await seedRfp(db, { buyerWsId: ws.id, createdBy: me.id });

    await db.insert(rfpTeamMessages).values([
      {
        id: randomUUID(),
        rfpId: rfp.id,
        workspaceId: ws.id,
        authorUserId: me.id,
        body: '메모 1',
        createdAt: new Date('2026-06-10T10:00:00Z'),
      },
      {
        id: randomUUID(),
        rfpId: rfp.id,
        workspaceId: ws.id,
        authorUserId: teammate.id,
        body: '메모 2',
        createdAt: new Date('2026-06-10T10:01:00Z'),
      },
    ]);

    sessionRef.value = {
      user: { id: me.id, email: 'me@b.com', workspaceId: ws.id, workspaceType: 'buyer' },
    };

    const r = await loadTeamThread(rfp.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.workspaceId).toBe(ws.id);
    expect(r.rfpId).toBe(rfp.id);
    // 라이브 echo 의 self 판별용 — 클라이언트는 세션 userId 를 모른다.
    expect(r.viewerUserId).toBe(me.id);
    expect(r.messages.map((m) => m.body)).toEqual(['메모 1', '메모 2']);
    expect(r.messages[0].isSelf).toBe(true);
    expect(r.messages[1].isSelf).toBe(false);
    expect(r.messages[1].authorName).toBe('이동료');
    expect(new Date(r.messages[0].createdAt).getTime()).not.toBeNaN();
  });

  it('hydrates attachments on messages', async () => {
    const me = await seedUser(db, { email: 'att@b.com', name: '김구매' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, me.id, 'admin');
    const rfp = await seedRfp(db, { buyerWsId: ws.id, createdBy: me.id });
    const msgId = randomUUID();
    await db.insert(rfpTeamMessages).values({
      id: msgId,
      rfpId: rfp.id,
      workspaceId: ws.id,
      authorUserId: me.id,
      body: '첨부 메모',
      createdAt: new Date('2026-06-10T10:00:00Z'),
    });
    const attId = randomUUID();
    await db.insert(attachments).values({
      id: attId,
      rfpTeamMessageId: msgId,
      name: 'memo.pdf',
      size: 100,
      mimeType: 'application/pdf',
      uploadedBy: me.id,
    });
    sessionRef.value = {
      user: { id: me.id, email: 'att@b.com', workspaceId: ws.id, workspaceType: 'buyer' },
    };

    const r = await loadTeamThread(rfp.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.messages[0].attachments.map((a) => a.id)).toEqual([attId]);
    expect(r.messages[0].attachments[0].url).toBe(`/api/files/${attId}`);
  });

  it('returns the team roster for mention autocomplete', async () => {
    const me = await seedUser(db, { email: 'roster@b.com', name: '김구매' });
    const teammate = await seedUser(db, { email: 'mate2@b.com', name: '이동료' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, me.id, 'admin');
    await seedMembership(db, ws.id, teammate.id);
    const rfp = await seedRfp(db, { buyerWsId: ws.id, createdBy: me.id });

    sessionRef.value = {
      user: { id: me.id, email: 'roster@b.com', workspaceId: ws.id, workspaceType: 'buyer' },
    };

    const r = await loadTeamThread(rfp.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.teamMembers.map((m) => m.userId).sort()).toEqual([me.id, teammate.id].sort());
    const mate = r.teamMembers.find((m) => m.userId === teammate.id);
    expect(mate?.name).toBe('이동료');
  });

  it('returns UNAUTHENTICATED without a session', async () => {
    sessionRef.value = null;
    const r = await loadTeamThread(randomUUID());
    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
  });

  it('returns INVALID_INPUT for a non-uuid rfpId', async () => {
    const me = await seedUser(db, { email: 'v@b.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, me.id);
    sessionRef.value = {
      user: { id: me.id, email: 'v@b.com', workspaceId: ws.id, workspaceType: 'buyer' },
    };
    expect(await loadTeamThread('not-a-uuid')).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
  });

  it('propagates FORBIDDEN for an uninvited workspace', async () => {
    const owner = await seedUser(db, { email: 'own@b.com' });
    const ownerWs = await seedBuyerWorkspace(db);
    await seedMembership(db, ownerWs.id, owner.id);
    const rfp = await seedRfp(db, { buyerWsId: ownerWs.id, createdBy: owner.id });

    const stranger = await seedUser(db, { email: 'str@b.com' });
    const strangerWs = await seedBuyerWorkspace(db);
    await seedMembership(db, strangerWs.id, stranger.id);
    sessionRef.value = {
      user: {
        id: stranger.id,
        email: 'str@b.com',
        workspaceId: strangerWs.id,
        workspaceType: 'buyer',
      },
    };

    const r = await loadTeamThread(rfp.id);
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('TeamThreadMessage carries authorAvatarUpdatedAt', async () => {
    const author = await seedUser(db, { email: 'avatar@b.com', name: '아바타작성자' });
    const me = await seedUser(db, { email: 'viewer@b.com', name: '뷰어' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, author.id, 'admin');
    await seedMembership(db, ws.id, me.id);
    const rfp = await seedRfp(db, { buyerWsId: ws.id, createdBy: author.id });

    await db
      .update(users)
      .set({ avatarUpdatedAt: new Date('2026-06-21T00:00:00.000Z') })
      .where(eq(users.id, author.id));

    await db.insert(rfpTeamMessages).values({
      id: randomUUID(),
      rfpId: rfp.id,
      workspaceId: ws.id,
      authorUserId: author.id,
      body: '아바타 테스트 메시지',
      createdAt: new Date('2026-06-21T00:00:00.000Z'),
    });

    sessionRef.value = {
      user: { id: me.id, email: 'viewer@b.com', workspaceId: ws.id, workspaceType: 'buyer' },
    };

    const res = await loadTeamThread(rfp.id);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.messages[0].authorAvatarUpdatedAt).toBe('2026-06-21T00:00:00.000Z');
      expect(res).toHaveProperty('viewerAvatarUpdatedAt');
    }
  });
});
