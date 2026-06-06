// canAccessAttachment matrix:
//   rfp:
//     - buyer ws member of the owning RFP → ALLOW
//     - any member of an invited PG ws (claim-state agnostic) → ALLOW
//     - PG user from a different ws (not invited) → DENY
//     - random user → DENY
//     - uploader (own row, e.g. draft window) → ALLOW
//   bid_proposal:
//     - buyer ws member of underlying RFP → ALLOW
//     - PG ws peer (same workspace as bid submitter) → ALLOW
//     - PG ws other (different workspace, even if invited) → DENY
//     - random user → DENY
//     - uploader → ALLOW
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  attachments,
  bidNotes,
  bids,
  rfpInvitations,
  rfps,
} from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __useDrizzleWithDbForTest, __resetForTest, getInvitationRepo, getWorkspaceRepo } from '@/lib/server/repositories/factory';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { generateToken, hashToken, addMinutes } from '@/lib/server/token';
import { canAccessAttachment, type AttachmentRow } from '../permissions';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});

afterEach(() => {
  __resetForTest();
});

type Scenario = {
  rfpId: string;
  buyerWsId: string;
  buyerUserId: string;
  buyerPeerUserId: string; // same buyer ws, different user — note ACL needs this
  pgWsId: string;
  pgUserId: string; // claimed the invitation
  pgPeerUserId: string; // same pg ws, different user
  otherPgWsId: string;
  otherPgUserId: string; // different pg ws — also invited but not relevant
  randomUserId: string; // unrelated
  uploaderId: string; // happens to be buyerUserId for rfp; pgUserId for bid_proposal
  rfpAttachment: AttachmentRow;
  bidAttachment: AttachmentRow;
  bidNoteAttachment: AttachmentRow;
};

async function seedScenario(): Promise<Scenario> {
  const buyer = await seedUser(db, { email: 'buyer@buy.com' });
  const buyerPeer = await seedUser(db, { email: 'buyer-peer@buy.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  await seedMembership(db, buyerWs.id, buyerPeer.id, 'member');

  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pgUser = await seedUser(db, { email: 'pg@toss.im' });
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');
  const pgPeer = await seedUser(db, { email: 'peer@toss.im' });
  await seedMembership(db, pgWs.id, pgPeer.id, 'member');

  const otherPgWs = await seedPgWorkspace(db, 'kakaopay.com');
  const otherPg = await seedUser(db, { email: 'pg@kakaopay.com' });
  await seedMembership(db, otherPgWs.id, otherPg.id, 'admin');

  const random = await seedUser(db, { email: 'rando@x.com' });

  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId,
    code: 'P-2605-0010',
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'perm test',
    memo: '',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'sent',
    createdBy: buyer.id,
    sentAt: new Date(),
  });

  const invForToss = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invForToss,
    rfpId,
    pgWsId: pgWs.id,
    acceptedByUserId: pgUser.id,
    tokenHash: hashToken(generateToken()),
    sentAt: new Date(),
    expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
    status: 'accepted',
  });
  // Other PG invited but not part of acceptance for the bid we'll create.
  await db.insert(rfpInvitations).values({
    id: randomUUID(),
    rfpId,
    pgWsId: otherPgWs.id,
    acceptedByUserId: otherPg.id,
    tokenHash: hashToken(generateToken()),
    sentAt: new Date(),
    expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
    status: 'accepted',
  });

  // RFP attachment — uploaded by buyer, linked to the RFP (exclusive-arc).
  const rfpAttId = randomUUID();
  await db.insert(attachments).values({
    id: rfpAttId,
    rfpId,
    name: 'rfp.pdf',
    size: 100,
    mimeType: 'application/pdf',
    uploadedBy: buyer.id,
  });

  // Bid (created before its proposal attachment — FK ordering).
  const bidId = randomUUID();
  await db.insert(bids).values({
    id: bidId,
    rfpId,
    pgWsId: pgWs.id,
    invitationId: invForToss,
    settleCycle: 'D+1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    paymentFees: {},
    submittedBy: pgUser.id,
  });
  // bid_proposal attachment — linked to the bid via bid_id.
  const proposalId = randomUUID();
  await db.insert(attachments).values({
    id: proposalId,
    bidId,
    name: 'proposal.pdf',
    size: 200,
    mimeType: 'application/pdf',
    uploadedBy: pgUser.id,
  });

  const rfpAttachment: AttachmentRow = {
    id: rfpAttId,
    rfpId,
    name: 'rfp.pdf',
    size: 100,
    mimeType: 'application/pdf',
    url: '',
    uploadedBy: buyer.id,
  };

  const bidAttachment: AttachmentRow = {
    id: proposalId,
    bidId,
    name: 'proposal.pdf',
    size: 200,
    mimeType: 'application/pdf',
    url: '',
    uploadedBy: pgUser.id,
  };

  // bid_note + attachment: a buyer-side note attached to the toss bid above,
  // authored by the buyer with an attachment uploaded by the same buyer.
  const noteId = randomUUID();
  await db.insert(bidNotes).values({
    id: noteId,
    bidId,
    authorId: buyer.id,
    body: 'memo body',
  });
  const noteAttId = randomUUID();
  await db.insert(attachments).values({
    id: noteAttId,
    bidNoteId: noteId,
    name: 'memo.pdf',
    size: 50,
    mimeType: 'application/pdf',
    uploadedBy: buyer.id,
  });
  const bidNoteAttachment: AttachmentRow = {
    id: noteAttId,
    bidNoteId: noteId,
    name: 'memo.pdf',
    size: 50,
    mimeType: 'application/pdf',
    url: '',
    uploadedBy: buyer.id,
  };

  return {
    rfpId,
    buyerWsId: buyerWs.id,
    buyerUserId: buyer.id,
    buyerPeerUserId: buyerPeer.id,
    pgWsId: pgWs.id,
    pgUserId: pgUser.id,
    pgPeerUserId: pgPeer.id,
    otherPgWsId: otherPgWs.id,
    otherPgUserId: otherPg.id,
    randomUserId: random.id,
    uploaderId: buyer.id,
    rfpAttachment,
    bidAttachment,
    bidNoteAttachment,
  };
}

async function repos() {
  return {
    invitation: await getInvitationRepo(),
    workspace: await getWorkspaceRepo(),
  };
}

describe('canAccessAttachment — rfp', () => {
  it('ALLOW for buyer ws member', async () => {
    const s = await seedScenario();
    const ok = await canAccessAttachment(
      db,
      s.rfpAttachment,
      {
        user: {
          id: s.buyerUserId,
          workspaceId: s.buyerWsId,
          workspaceType: 'buyer',
        },
      },
      await repos(),
    );
    expect(ok).toBe(true);
  });

  it('ALLOW for accepted PG invitation', async () => {
    const s = await seedScenario();
    const ok = await canAccessAttachment(
      db,
      s.rfpAttachment,
      {
        user: { id: s.pgUserId, workspaceId: s.pgWsId, workspaceType: 'pg' },
      },
      await repos(),
    );
    expect(ok).toBe(true);
  });

  it('ALLOW for PG ws peer (member of invited ws, did not personally claim)', async () => {
    const s = await seedScenario();
    const ok = await canAccessAttachment(
      db,
      s.rfpAttachment,
      {
        user: { id: s.pgPeerUserId, workspaceId: s.pgWsId, workspaceType: 'pg' },
      },
      await repos(),
    );
    expect(ok).toBe(true);
  });

  it('DENY for random unrelated user', async () => {
    const s = await seedScenario();
    const ok = await canAccessAttachment(
      db,
      s.rfpAttachment,
      { user: { id: s.randomUserId } },
      await repos(),
    );
    expect(ok).toBe(false);
  });

  it('ALLOW for uploader regardless of ws (draft window)', async () => {
    const s = await seedScenario();
    // Pretend the buyer lost their workspace claim — uploader path still grants.
    const ok = await canAccessAttachment(
      db,
      s.rfpAttachment,
      { user: { id: s.uploaderId } },
      await repos(),
    );
    expect(ok).toBe(true);
  });
});

describe('canAccessAttachment — bid_proposal', () => {
  it('ALLOW for buyer ws member of underlying RFP', async () => {
    const s = await seedScenario();
    const ok = await canAccessAttachment(
      db,
      s.bidAttachment,
      {
        user: {
          id: s.buyerUserId,
          workspaceId: s.buyerWsId,
          workspaceType: 'buyer',
        },
      },
      await repos(),
    );
    expect(ok).toBe(true);
  });

  it('ALLOW for PG ws peer (same ws as submitter)', async () => {
    const s = await seedScenario();
    const ok = await canAccessAttachment(
      db,
      s.bidAttachment,
      {
        user: {
          id: s.pgPeerUserId,
          workspaceId: s.pgWsId,
          workspaceType: 'pg',
        },
      },
      await repos(),
    );
    expect(ok).toBe(true);
  });

  it('DENY for PG ws other (different workspace, even if invited)', async () => {
    const s = await seedScenario();
    const ok = await canAccessAttachment(
      db,
      s.bidAttachment,
      {
        user: {
          id: s.otherPgUserId,
          workspaceId: s.otherPgWsId,
          workspaceType: 'pg',
        },
      },
      await repos(),
    );
    expect(ok).toBe(false);
  });

  it('DENY for random unrelated user', async () => {
    const s = await seedScenario();
    const ok = await canAccessAttachment(
      db,
      s.bidAttachment,
      { user: { id: s.randomUserId } },
      await repos(),
    );
    expect(ok).toBe(false);
  });
});

describe('canAccessAttachment — bid_note', () => {
  it('ALLOW for buyer ws member who is not the uploader', async () => {
    const s = await seedScenario();
    // buyerPeer is a member of the buyer ws but DID NOT upload the note —
    // bypasses the uploader early-allow and exercises the real bid_note
    // branch in canAccessAttachment.
    const ok = await canAccessAttachment(
      db,
      s.bidNoteAttachment,
      {
        user: {
          id: s.buyerPeerUserId,
          workspaceId: s.buyerWsId,
          workspaceType: 'buyer',
        },
      },
      await repos(),
    );
    expect(ok).toBe(true);
  });

  it('DENY for any PG user (buyer-private memos)', async () => {
    const s = await seedScenario();
    // The PG that submitted the bid this note attaches to — still DENY.
    const okSubmitter = await canAccessAttachment(
      db,
      s.bidNoteAttachment,
      {
        user: {
          id: s.pgUserId,
          workspaceId: s.pgWsId,
          workspaceType: 'pg',
        },
      },
      await repos(),
    );
    expect(okSubmitter).toBe(false);

    const okPeer = await canAccessAttachment(
      db,
      s.bidNoteAttachment,
      {
        user: {
          id: s.pgPeerUserId,
          workspaceId: s.pgWsId,
          workspaceType: 'pg',
        },
      },
      await repos(),
    );
    expect(okPeer).toBe(false);
  });

  it('DENY for random unrelated user', async () => {
    const s = await seedScenario();
    const ok = await canAccessAttachment(
      db,
      s.bidNoteAttachment,
      { user: { id: s.randomUserId } },
      await repos(),
    );
    expect(ok).toBe(false);
  });

  it('ALLOW for uploader (draft window — first attachment before note row)', async () => {
    const s = await seedScenario();
    // Uploader (buyer) regardless of ws claim.
    const ok = await canAccessAttachment(
      db,
      s.bidNoteAttachment,
      { user: { id: s.uploaderId } },
      await repos(),
    );
    expect(ok).toBe(true);
  });
});

describe('canAccessAttachment — chatMessageId branch', () => {
  it('ALLOW for buyer side of conversation', async () => {
    const s = await seedScenario();
    const { chatConversations, chatMessages } = await import('@/lib/db/schema');
    const convId = randomUUID();
    await db.insert(chatConversations).values({ id: convId, buyerWsId: s.buyerWsId, pgWsId: s.pgWsId });
    const msgId = randomUUID();
    await db.insert(chatMessages).values({
      id: msgId,
      conversationId: convId,
      authorUserId: s.buyerUserId,
      authorWsId: s.buyerWsId,
      body: 'test',
    });
    const attId = randomUUID();
    await db.insert(attachments).values({
      id: attId,
      chatMessageId: msgId,
      name: 'chat.pdf',
      size: 100,
      mimeType: 'application/pdf',
      uploadedBy: s.buyerUserId,
    });
    // uploadedBy is intentionally set to pgUserId (not the actual uploader s.buyerUserId)
    // so the top-level fast-path (att.uploadedBy === userId) does NOT short-circuit —
    // this forces the chatMessageId branch to run and be exercised.
    const att: AttachmentRow = { id: attId, chatMessageId: msgId, name: 'chat.pdf', size: 100, mimeType: 'application/pdf', url: '', uploadedBy: s.pgUserId };
    const ok = await canAccessAttachment(
      db, att,
      { user: { id: s.buyerUserId, workspaceId: s.buyerWsId, workspaceType: 'buyer' } },
      await repos(),
    );
    expect(ok).toBe(true);
  });

  it('ALLOW for pg side of conversation', async () => {
    const s = await seedScenario();
    const { chatConversations, chatMessages } = await import('@/lib/db/schema');
    const convId = randomUUID();
    await db.insert(chatConversations).values({ id: convId, buyerWsId: s.buyerWsId, pgWsId: s.pgWsId });
    const msgId = randomUUID();
    await db.insert(chatMessages).values({
      id: msgId,
      conversationId: convId,
      authorUserId: s.buyerUserId,
      authorWsId: s.buyerWsId,
      body: 'test',
    });
    const attId = randomUUID();
    await db.insert(attachments).values({
      id: attId,
      chatMessageId: msgId,
      name: 'chat.pdf',
      size: 100,
      mimeType: 'application/pdf',
      uploadedBy: s.buyerUserId,
    });
    const att: AttachmentRow = { id: attId, chatMessageId: msgId, name: 'chat.pdf', size: 100, mimeType: 'application/pdf', url: '', uploadedBy: s.buyerUserId };
    const ok = await canAccessAttachment(
      db, att,
      { user: { id: s.pgUserId, workspaceId: s.pgWsId, workspaceType: 'pg' } },
      await repos(),
    );
    expect(ok).toBe(true);
  });

  it('DENY for a workspace that is not part of the conversation', async () => {
    const s = await seedScenario();
    const { chatConversations, chatMessages } = await import('@/lib/db/schema');
    const convId = randomUUID();
    await db.insert(chatConversations).values({ id: convId, buyerWsId: s.buyerWsId, pgWsId: s.pgWsId });
    const msgId = randomUUID();
    await db.insert(chatMessages).values({
      id: msgId, conversationId: convId, authorUserId: s.buyerUserId, authorWsId: s.buyerWsId, body: 'test',
    });
    const attId = randomUUID();
    await db.insert(attachments).values({
      id: attId, chatMessageId: msgId, name: 'chat.pdf', size: 100, mimeType: 'application/pdf', uploadedBy: s.buyerUserId,
    });
    const att: AttachmentRow = { id: attId, chatMessageId: msgId, name: 'chat.pdf', size: 100, mimeType: 'application/pdf', url: '', uploadedBy: s.buyerUserId };
    // otherPgUserId is in a different workspace — not part of this conversation.
    const ok = await canAccessAttachment(
      db, att,
      { user: { id: s.otherPgUserId, workspaceId: s.otherPgWsId, workspaceType: 'pg' } },
      await repos(),
    );
    expect(ok).toBe(false);
  });

  it('DENY when wsId is missing from session (unauthenticated-ish)', async () => {
    const s = await seedScenario();
    const { chatConversations, chatMessages } = await import('@/lib/db/schema');
    const convId = randomUUID();
    await db.insert(chatConversations).values({ id: convId, buyerWsId: s.buyerWsId, pgWsId: s.pgWsId });
    const msgId = randomUUID();
    await db.insert(chatMessages).values({
      id: msgId, conversationId: convId, authorUserId: s.buyerUserId, authorWsId: s.buyerWsId, body: 'test',
    });
    const attId = randomUUID();
    await db.insert(attachments).values({
      id: attId, chatMessageId: msgId, name: 'chat.pdf', size: 100, mimeType: 'application/pdf', uploadedBy: s.buyerUserId,
    });
    // att.uploadedBy !== randomUserId so uploader fast-path doesn't fire
    const att: AttachmentRow = { id: attId, chatMessageId: msgId, name: 'chat.pdf', size: 100, mimeType: 'application/pdf', url: '', uploadedBy: s.buyerUserId };
    // session has no workspaceId — exercises `if (!wsId) return false`
    const ok = await canAccessAttachment(
      db, att,
      { user: { id: s.randomUserId } },
      await repos(),
    );
    expect(ok).toBe(false);
  });

  it('DENY when chatMessageId is not in DB (orphan FK — tested via mock db)', async () => {
    // PGlite enforces FK so we can't insert an orphan row.  Instead we pass a
    // stub `db` whose query chain returns [] for the first SELECT, simulating
    // a deleted/missing chatMessages row.
    const s = await seedScenario();
    const phantomMsgId = randomUUID();
    const att: AttachmentRow = {
      id: randomUUID(),
      chatMessageId: phantomMsgId,
      name: 'ghost.pdf',
      size: 100,
      mimeType: 'application/pdf',
      url: '',
      uploadedBy: s.pgUserId, // different from querying user → uploader skip does not fire
    };
    // Minimal fluent-query stub that returns [] for every call.
    const emptyChain = { from: () => emptyChain, where: () => emptyChain, limit: () => Promise.resolve([]) };
    const mockDb = { select: () => emptyChain };
    const ok = await canAccessAttachment(
      mockDb as unknown as typeof db,
      att,
      { user: { id: s.buyerUserId, workspaceId: s.buyerWsId, workspaceType: 'buyer' } },
      await repos(),
    );
    expect(ok).toBe(false);
  });

  it('DENY when conversation row is not in DB (orphan message — tested via mock db)', async () => {
    const s = await seedScenario();
    const phantomConvId = randomUUID();
    const att: AttachmentRow = {
      id: randomUUID(),
      chatMessageId: randomUUID(),
      name: 'ghost2.pdf',
      size: 100,
      mimeType: 'application/pdf',
      url: '',
      uploadedBy: s.pgUserId,
    };
    // First call (chatMessages lookup) returns a row; second call (chatConversations) returns [].
    let callCount = 0;
    const makeChain = (result: unknown[]) => {
      const c = { from: () => c, where: () => c, limit: () => Promise.resolve(result) };
      return c;
    };
    const mockDb = {
      select: () => {
        callCount += 1;
        return callCount === 1
          ? makeChain([{ conversationId: phantomConvId }])
          : makeChain([]);
      },
    };
    const ok = await canAccessAttachment(
      mockDb as unknown as typeof db,
      att,
      { user: { id: s.buyerUserId, workspaceId: s.buyerWsId, workspaceType: 'buyer' } },
      await repos(),
    );
    expect(ok).toBe(false);
  });
});
