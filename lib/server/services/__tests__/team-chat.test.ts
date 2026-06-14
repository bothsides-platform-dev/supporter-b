// TeamChatService — RFP-scoped internal team thread (v1).
//
// ACL contract:
//   buyer actor → allowed iff rfp.buyerWsId === actor.workspaceId
//   pg actor    → allowed iff invRepo.canAccess(rfpId, actor.workspaceId)
//                 (the same gate as the PG inbox detail loader)
// Scope: messages live in (rfpId, workspaceId) — a PG team thread and the
// buyer team thread on the same RFP must never mix (sealed-bid invariant).

import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getInvitationRepo,
  getRfpRepo,
  getRfpTeamMessageRepo,
  getUserRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedRfp,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { attachments, rfpInvitations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { TeamChatService, type TeamChatActor } from '../team-chat';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;
let service: TeamChatService;

async function buildService(): Promise<TeamChatService> {
  const [rfpRepo, invRepo, userRepo, msgRepo] = await Promise.all([
    getRfpRepo(),
    getInvitationRepo(),
    getUserRepo(),
    getRfpTeamMessageRepo(),
  ]);
  return new TeamChatService(db, rfpRepo, invRepo, userRepo, msgRepo);
}

// Draft attachment — all owner FKs null (valid: num_nonnulls <= 1).
async function seedDraftAttachment(uploaderId: string, name = 'team.pdf') {
  const id = randomUUID();
  await db.insert(attachments).values({
    id,
    name,
    size: 2048,
    mimeType: 'application/pdf',
    uploadedBy: uploaderId,
  });
  return id;
}

async function seedScene() {
  const buyerUser = await seedUser(db, { name: '김구매' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id });

  const pgUser = await seedUser(db, { name: '박피지' });
  const pgWs = await seedPgWorkspace(db, 'OO페이');
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');
  // Invited PG — canAccess requires status in (pending|opened|accepted).
  await db.insert(rfpInvitations).values({
    id: randomUUID(),
    rfpId: rfp.id,
    pgWsId: pgWs.id,
    tokenHash: `hash-${randomUUID()}`,
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    status: 'pending',
  });

  const buyerActor: TeamChatActor = {
    userId: buyerUser.id,
    workspaceId: buyerWs.id,
    workspaceType: 'buyer',
  };
  const pgActor: TeamChatActor = {
    userId: pgUser.id,
    workspaceId: pgWs.id,
    workspaceType: 'pg',
  };
  return { buyerUser, buyerWs, pgUser, pgWs, rfp, buyerActor, pgActor };
}

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  service = await buildService();
});

afterEach(() => {
  __resetForTest();
});

describe('TeamChatService.sendMessage', () => {
  it('lets a member of the owning buyer workspace send, and returns authorName', async () => {
    const { rfp, buyerActor } = await seedScene();
    const result = await service.sendMessage({ rfpId: rfp.id, body: '내부 메모' }, buyerActor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messageId).toBeTruthy();
      expect(result.authorName).toBe('김구매');
      expect(new Date(result.createdAt).getTime()).not.toBeNaN();
    }
  });

  it('lets an invited PG workspace send into its own scope', async () => {
    const { rfp, pgActor } = await seedScene();
    const result = await service.sendMessage({ rfpId: rfp.id, body: 'PG 내부 메모' }, pgActor);
    expect(result.ok).toBe(true);
  });

  it('rejects a buyer workspace that does not own the RFP', async () => {
    const { rfp } = await seedScene();
    const otherUser = await seedUser(db);
    const otherBuyer = await seedBuyerWorkspace(db);
    await seedMembership(db, otherBuyer.id, otherUser.id);
    const result = await service.sendMessage(
      { rfpId: rfp.id, body: 'x' },
      { userId: otherUser.id, workspaceId: otherBuyer.id, workspaceType: 'buyer' },
    );
    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('rejects an uninvited PG workspace', async () => {
    const { rfp } = await seedScene();
    const strangerUser = await seedUser(db);
    const strangerPg = await seedPgWorkspace(db, '낯선페이');
    await seedMembership(db, strangerPg.id, strangerUser.id);
    const result = await service.sendMessage(
      { rfpId: rfp.id, body: 'x' },
      { userId: strangerUser.id, workspaceId: strangerPg.id, workspaceType: 'pg' },
    );
    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('rejects an unknown rfp', async () => {
    const { buyerActor } = await seedScene();
    const result = await service.sendMessage(
      { rfpId: randomUUID(), body: 'x' },
      buyerActor,
    );
    expect(result).toEqual({ ok: false, error: 'RFP_NOT_FOUND' });
  });

  it('rejects an empty (whitespace-only) body', async () => {
    const { rfp, buyerActor } = await seedScene();
    const result = await service.sendMessage({ rfpId: rfp.id, body: '   ' }, buyerActor);
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('rejects a body over 4000 chars at the service layer (defense-in-depth)', async () => {
    const { rfp, buyerActor } = await seedScene();
    const result = await service.sendMessage(
      { rfpId: rfp.id, body: 'x'.repeat(4001) },
      buyerActor,
    );
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });
});

describe('TeamChatService.sendMessage — attachments', () => {
  it('re-parents draft attachments to the new message and returns them in order', async () => {
    const { rfp, buyerActor, buyerUser } = await seedScene();
    const a1 = await seedDraftAttachment(buyerUser.id, 'first.pdf');
    const a2 = await seedDraftAttachment(buyerUser.id, 'second.pdf');

    const result = await service.sendMessage(
      { rfpId: rfp.id, body: '첨부 메모', attachmentIds: [a1, a2] },
      buyerActor,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments.map((a) => a.id)).toEqual([a1, a2]);
    expect(result.attachments.map((a) => a.name)).toEqual(['first.pdf', 'second.pdf']);
    expect(result.attachments[0].url).toBe(`/api/files/${a1}`);

    // Both attachment rows now point at the new message (exclusive-arc).
    for (const id of [a1, a2]) {
      const [row] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, id))
        .limit(1);
      expect(row.rfpTeamMessageId).toBe(result.messageId);
      expect(row.rfpId).toBeNull();
      expect(row.bidId).toBeNull();
      expect(row.bidNoteId).toBeNull();
      expect(row.chatMessageId).toBeNull();
    }
  });

  it('allows an attachment-only message (empty body)', async () => {
    const { rfp, buyerActor, buyerUser } = await seedScene();
    const a1 = await seedDraftAttachment(buyerUser.id);
    const result = await service.sendMessage(
      { rfpId: rfp.id, body: '', attachmentIds: [a1] },
      buyerActor,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attachments).toHaveLength(1);
    }
  });

  it('rejects an empty message with no attachments', async () => {
    const { rfp, buyerActor } = await seedScene();
    const result = await service.sendMessage(
      { rfpId: rfp.id, body: '', attachmentIds: [] },
      buyerActor,
    );
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('rejects an attachment not uploaded by the actor', async () => {
    const { rfp, buyerActor } = await seedScene();
    const stranger = await seedUser(db);
    const foreign = await seedDraftAttachment(stranger.id);
    const result = await service.sendMessage(
      { rfpId: rfp.id, body: '메모', attachmentIds: [foreign] },
      buyerActor,
    );
    expect(result).toEqual({ ok: false, error: 'INVALID_ATTACHMENT' });
  });

  it('rejects an attachment that is already linked to another owner', async () => {
    const { rfp, buyerActor, buyerUser } = await seedScene();
    const a1 = await seedDraftAttachment(buyerUser.id);
    // First send claims it.
    const first = await service.sendMessage(
      { rfpId: rfp.id, body: '1', attachmentIds: [a1] },
      buyerActor,
    );
    expect(first.ok).toBe(true);
    // Second send re-using the same (now-linked) attachment must fail.
    const second = await service.sendMessage(
      { rfpId: rfp.id, body: '2', attachmentIds: [a1] },
      buyerActor,
    );
    expect(second).toEqual({ ok: false, error: 'INVALID_ATTACHMENT' });
  });
});

describe('TeamChatService.listMessages', () => {
  it('returns own-scope messages asc and never the other workspace thread', async () => {
    const { rfp, buyerActor, pgActor } = await seedScene();
    await service.sendMessage({ rfpId: rfp.id, body: 'buyer 1' }, buyerActor);
    await service.sendMessage({ rfpId: rfp.id, body: 'pg 1' }, pgActor);
    await service.sendMessage({ rfpId: rfp.id, body: 'buyer 2' }, buyerActor);

    const buyerList = await service.listMessages(rfp.id, buyerActor);
    expect(buyerList.ok).toBe(true);
    if (buyerList.ok) {
      expect(buyerList.messages.map((m) => m.body)).toEqual(['buyer 1', 'buyer 2']);
      expect(buyerList.messages[0].authorName).toBe('김구매');
    }

    const pgList = await service.listMessages(rfp.id, pgActor);
    expect(pgList.ok).toBe(true);
    if (pgList.ok) {
      expect(pgList.messages.map((m) => m.body)).toEqual(['pg 1']);
    }
  });

  it('hydrates attachments on each message', async () => {
    const { rfp, buyerActor, buyerUser } = await seedScene();
    const a1 = await seedDraftAttachment(buyerUser.id, 'memo.pdf');
    await service.sendMessage(
      { rfpId: rfp.id, body: '첨부 메모', attachmentIds: [a1] },
      buyerActor,
    );
    await service.sendMessage({ rfpId: rfp.id, body: '텍스트만' }, buyerActor);

    const list = await service.listMessages(rfp.id, buyerActor);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.messages).toHaveLength(2);
      expect(list.messages[0].attachments.map((a) => a.id)).toEqual([a1]);
      expect(list.messages[0].attachments[0].url).toBe(`/api/files/${a1}`);
      // The text-only message has an empty attachments array, not undefined.
      expect(list.messages[1].attachments).toEqual([]);
    }
  });

  it('applies the same ACL as send (uninvited PG forbidden)', async () => {
    const { rfp } = await seedScene();
    const strangerUser = await seedUser(db);
    const strangerPg = await seedPgWorkspace(db, '낯선페이2');
    await seedMembership(db, strangerPg.id, strangerUser.id);
    const result = await service.listMessages(rfp.id, {
      userId: strangerUser.id,
      workspaceId: strangerPg.id,
      workspaceType: 'pg',
    });
    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});
