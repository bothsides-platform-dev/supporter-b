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
  contractTemplates,
  rfpInvitations,
  rfps,
} from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __useDrizzleWithDbForTest,
  __resetForTest,
  getBidNoteRepo,
  getBidRepo,
  getChatConversationRepo,
  getChatMessageRepo,
  getContractTemplateRepo,
  getInvitationRepo,
  getRfpRepo,
  getRfpTeamMessageRepo,
} from '@/lib/server/repositories/factory';
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
    rfp: await getRfpRepo(),
    bid: await getBidRepo(),
    bidNote: await getBidNoteRepo(),
    chatMessage: await getChatMessageRepo(),
    chatConversation: await getChatConversationRepo(),
    rfpTeamMessage: await getRfpTeamMessageRepo(),
    contractTemplate: await getContractTemplateRepo(),
  };
}

describe('canAccessAttachment — rfp', () => {
  it('ALLOW for buyer ws member', async () => {
    const s = await seedScenario();
    const ok = await canAccessAttachment(
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
      s.bidAttachment,
      { user: { id: s.randomUserId } },
      await repos(),
    );
    expect(ok).toBe(false);
  });

  // Subtle behavior lock: the PG-ws fast-path (bid.pgWsId === session.wsId)
  // grants WITHOUT an isMember check — unlike the buyer path. A user whose
  // session.workspaceId equals the bid's pgWsId but who is NOT actually a
  // member of that ws is still ALLOWED. The migration must preserve this
  // exactly (do NOT add an isMember gate to the PG side, do NOT broaden it).
  it('ALLOW for PG fast-path even when session user is NOT a member of bid pgWs', async () => {
    const s = await seedScenario();
    // randomUserId is not a member of pgWs, but we forge a session claiming
    // workspaceId = pgWsId. uploadedBy is pgUserId (≠ randomUserId) so the
    // uploader fast-path does not fire — forces the bid branch.
    const ok = await canAccessAttachment(
      s.bidAttachment,
      { user: { id: s.randomUserId, workspaceId: s.pgWsId, workspaceType: 'pg' } },
      await repos(),
    );
    expect(ok).toBe(true);
  });

  // Lock the "no bid row → DENY" guard (phantom bidId, e.g. deleted bid).
  // A bidId that was never seeded resolves to nothing → DENY. Works against
  // the real pglite db both for the raw-query impl (db arg) and the migrated
  // repo impl (factory-bound db), since neither finds the row.
  it('DENY when bid row is missing (unseeded bidId)', async () => {
    const s = await seedScenario();
    const att: AttachmentRow = {
      id: randomUUID(),
      bidId: randomUUID(), // never inserted → owner chain resolves to nothing
      name: 'ghost-proposal.pdf',
      size: 200,
      mimeType: 'application/pdf',
      url: '',
      uploadedBy: s.pgUserId, // ≠ querying user so uploader fast-path skips
    };
    const ok = await canAccessAttachment(
      att,
      { user: { id: s.buyerUserId, workspaceId: s.buyerWsId, workspaceType: 'buyer' } },
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
      s.bidNoteAttachment,
      { user: { id: s.uploaderId } },
      await repos(),
    );
    expect(ok).toBe(true);
  });

  // Contract: after isMember() removal, wsId JWT claim alone gates access.
  // A user whose session.workspaceId matches the bid's buyer ws is ALLOWED
  // even if they are not in workspaceMembers — stale-session security is
  // handled by removeMember → bumpSessionVersion, not by isMember() here.
  it('ALLOW for user claiming buyer wsId even if not a DB member (wsId claim is authoritative)', async () => {
    const s = await seedScenario();
    // randomUserId is NOT a member of buyerWs — only wsId claim is checked.
    const ok = await canAccessAttachment(
      s.bidNoteAttachment,
      { user: { id: s.randomUserId, workspaceId: s.buyerWsId, workspaceType: 'buyer' } },
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
      att,
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
      att,
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
      att,
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
      att,
      { user: { id: s.randomUserId } },
      await repos(),
    );
    expect(ok).toBe(false);
  });

  it('DENY when chatMessageId is not in DB (orphan FK — unseeded messageId)', async () => {
    // PGlite enforces FK so we can't insert an orphan attachment row, but we can
    // hand canAccessAttachment an att whose chatMessageId was never seeded —
    // chatMessage.findConversationId resolves to undefined → DENY at guard 1.
    const s = await seedScenario();
    const att: AttachmentRow = {
      id: randomUUID(),
      chatMessageId: randomUUID(), // never inserted
      name: 'ghost.pdf',
      size: 100,
      mimeType: 'application/pdf',
      url: '',
      uploadedBy: s.pgUserId, // different from querying user → uploader skip does not fire
    };
    const ok = await canAccessAttachment(
      att,
      { user: { id: s.buyerUserId, workspaceId: s.buyerWsId, workspaceType: 'buyer' } },
      await repos(),
    );
    expect(ok).toBe(false);
  });

  // Contract: wsId claim alone gates — no isMember() DB check after the redesign.
  it('ALLOW for user claiming conversation\'s buyer wsId even if not a DB member', async () => {
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
      id: attId, chatMessageId: msgId, name: 'chat.pdf', size: 100, mimeType: 'application/pdf',
      uploadedBy: s.buyerUserId,
    });
    // uploadedBy=pgUserId to bypass uploader fast-path; randomUserId claims buyerWsId
    const att: AttachmentRow = { id: attId, chatMessageId: msgId, name: 'chat.pdf', size: 100, mimeType: 'application/pdf', url: '', uploadedBy: s.pgUserId };
    // randomUserId is NOT in workspaceMembers for buyerWs — wsId claim alone grants.
    const ok = await canAccessAttachment(
      att,
      { user: { id: s.randomUserId, workspaceId: s.buyerWsId, workspaceType: 'buyer' } },
      await repos(),
    );
    expect(ok).toBe(true);
  });

  it('DENY when conversation row is not in DB (orphan message — chatConversation repo stub)', async () => {
    // FK makes a message→missing-conversation state logically unreachable in
    // pglite, so we override only chatConversation.findById to return undefined
    // while a REAL message resolves its conversationId — this exercises the
    // `if (!conv) return false` guard in the migrated repo path.
    const s = await seedScenario();
    const { chatConversations, chatMessages } = await import('@/lib/db/schema');
    const convId = randomUUID();
    await db.insert(chatConversations).values({ id: convId, buyerWsId: s.buyerWsId, pgWsId: s.pgWsId });
    const msgId = randomUUID();
    await db.insert(chatMessages).values({
      id: msgId, conversationId: convId, authorUserId: s.buyerUserId, authorWsId: s.buyerWsId, body: 'real',
    });
    const att: AttachmentRow = {
      id: randomUUID(),
      chatMessageId: msgId,
      name: 'ghost2.pdf',
      size: 100,
      mimeType: 'application/pdf',
      url: '',
      uploadedBy: s.pgUserId,
    };
    const base = await repos();
    const stubbed = {
      ...base,
      chatConversation: { ...base.chatConversation, findById: async () => undefined },
    };
    const ok = await canAccessAttachment(
      att,
      { user: { id: s.buyerUserId, workspaceId: s.buyerWsId, workspaceType: 'buyer' } },
      stubbed,
    );
    expect(ok).toBe(false);
  });
});

// Team-message attachments are scoped to one (rfp, workspace) thread. Sealed-bid:
// each workspace reads only its OWN team-thread attachments — a PG never sees the
// buyer team's files and vice versa, even on the same RFP.
describe('canAccessAttachment — rfpTeamMessageId branch (sealed-bid)', () => {
  async function seedTeamAtt(
    s: Scenario,
    opts: { workspaceId: string; authorUserId: string; uploadedBy: string },
  ): Promise<AttachmentRow> {
    const { rfpTeamMessages } = await import('@/lib/db/schema');
    const msgId = randomUUID();
    await db.insert(rfpTeamMessages).values({
      id: msgId,
      rfpId: s.rfpId,
      workspaceId: opts.workspaceId,
      authorUserId: opts.authorUserId,
      body: 'team note',
    });
    const attId = randomUUID();
    await db.insert(attachments).values({
      id: attId,
      rfpTeamMessageId: msgId,
      name: 'team.pdf',
      size: 80,
      mimeType: 'application/pdf',
      uploadedBy: opts.uploadedBy,
    });
    return {
      id: attId,
      rfpTeamMessageId: msgId,
      name: 'team.pdf',
      size: 80,
      mimeType: 'application/pdf',
      url: '',
      uploadedBy: opts.uploadedBy,
    };
  }

  it('ALLOW for buyer ws member on buyer-scope team message', async () => {
    const s = await seedScenario();
    // authored+uploaded by buyer; buyerPeer (member, not uploader) reads it →
    // exercises the real branch, not the uploader fast-path.
    const att = await seedTeamAtt(s, {
      workspaceId: s.buyerWsId,
      authorUserId: s.buyerUserId,
      uploadedBy: s.buyerUserId,
    });
    const ok = await canAccessAttachment(
      att,
      { user: { id: s.buyerPeerUserId, workspaceId: s.buyerWsId, workspaceType: 'buyer' } },
      await repos(),
    );
    expect(ok).toBe(true);
  });

  it('ALLOW for pg ws member on pg-scope team message', async () => {
    const s = await seedScenario();
    const att = await seedTeamAtt(s, {
      workspaceId: s.pgWsId,
      authorUserId: s.pgUserId,
      uploadedBy: s.pgUserId,
    });
    const ok = await canAccessAttachment(
      att,
      { user: { id: s.pgPeerUserId, workspaceId: s.pgWsId, workspaceType: 'pg' } },
      await repos(),
    );
    expect(ok).toBe(true);
  });

  it('DENY for buyer reading pg-scope team message (sealed-bid)', async () => {
    const s = await seedScenario();
    const att = await seedTeamAtt(s, {
      workspaceId: s.pgWsId,
      authorUserId: s.pgUserId,
      uploadedBy: s.pgUserId,
    });
    const ok = await canAccessAttachment(
      att,
      { user: { id: s.buyerUserId, workspaceId: s.buyerWsId, workspaceType: 'buyer' } },
      await repos(),
    );
    expect(ok).toBe(false);
  });

  it('DENY for pg reading buyer-scope team message (sealed-bid)', async () => {
    const s = await seedScenario();
    const att = await seedTeamAtt(s, {
      workspaceId: s.buyerWsId,
      authorUserId: s.buyerUserId,
      uploadedBy: s.buyerUserId,
    });
    const ok = await canAccessAttachment(
      att,
      { user: { id: s.pgUserId, workspaceId: s.pgWsId, workspaceType: 'pg' } },
      await repos(),
    );
    expect(ok).toBe(false);
  });

  it('DENY for other pg ws on pg-scope team message (cross-PG isolation)', async () => {
    const s = await seedScenario();
    const att = await seedTeamAtt(s, {
      workspaceId: s.pgWsId,
      authorUserId: s.pgUserId,
      uploadedBy: s.pgUserId,
    });
    const ok = await canAccessAttachment(
      att,
      { user: { id: s.otherPgUserId, workspaceId: s.otherPgWsId, workspaceType: 'pg' } },
      await repos(),
    );
    expect(ok).toBe(false);
  });

  it('DENY when wsId is missing from session', async () => {
    const s = await seedScenario();
    const att = await seedTeamAtt(s, {
      workspaceId: s.buyerWsId,
      authorUserId: s.buyerUserId,
      uploadedBy: s.buyerUserId,
    });
    const ok = await canAccessAttachment(
      att,
      { user: { id: s.randomUserId } },
      await repos(),
    );
    expect(ok).toBe(false);
  });

  // Contract: wsId claim alone is sufficient — no isMember() DB check.
  it('ALLOW for user claiming the thread workspace even if not a DB member', async () => {
    const s = await seedScenario();
    const att = await seedTeamAtt(s, {
      workspaceId: s.buyerWsId,
      authorUserId: s.buyerUserId,
      uploadedBy: s.buyerUserId,
    });
    // randomUserId is NOT a member of buyerWs — wsId JWT claim alone grants.
    // uploadedBy=buyerUserId (≠ randomUserId) so uploader fast-path does not fire.
    const ok = await canAccessAttachment(
      att,
      { user: { id: s.randomUserId, workspaceId: s.buyerWsId, workspaceType: 'buyer' } },
      await repos(),
    );
    expect(ok).toBe(true);
  });
});

describe('canAccessAttachment — contractTemplateId branch', () => {
  async function seedTemplateAtt(opts: {
    pgWsId: string;
    createdBy: string;
    uploadedBy: string;
  }): Promise<AttachmentRow> {
    const templateId = randomUUID();
    await db.insert(contractTemplates).values({
      id: templateId,
      pgWsId: opts.pgWsId,
      name: '표준 계약서',
      description: '',
      createdBy: opts.createdBy,
    });
    const attId = randomUUID();
    await db.insert(attachments).values({
      id: attId,
      contractTemplateId: templateId,
      name: 'template.pdf',
      size: 90,
      mimeType: 'application/pdf',
      uploadedBy: opts.uploadedBy,
    });
    return {
      id: attId,
      contractTemplateId: templateId,
      name: 'template.pdf',
      size: 90,
      mimeType: 'application/pdf',
      url: '',
      uploadedBy: opts.uploadedBy,
    };
  }

  it('ALLOW for a member of the owning PG workspace (not the uploader)', async () => {
    const s = await seedScenario();
    const att = await seedTemplateAtt({
      pgWsId: s.pgWsId,
      createdBy: s.pgUserId,
      uploadedBy: s.pgUserId,
    });
    const ok = await canAccessAttachment(
      att,
      { user: { id: s.pgPeerUserId, workspaceId: s.pgWsId, workspaceType: 'pg' } },
      await repos(),
    );
    expect(ok).toBe(true);
  });

  it('DENY for a different PG workspace', async () => {
    const s = await seedScenario();
    const att = await seedTemplateAtt({
      pgWsId: s.pgWsId,
      createdBy: s.pgUserId,
      uploadedBy: s.pgUserId,
    });
    const ok = await canAccessAttachment(
      att,
      { user: { id: s.otherPgUserId, workspaceId: s.otherPgWsId, workspaceType: 'pg' } },
      await repos(),
    );
    expect(ok).toBe(false);
  });

  it('DENY for the buyer workspace', async () => {
    const s = await seedScenario();
    const att = await seedTemplateAtt({
      pgWsId: s.pgWsId,
      createdBy: s.pgUserId,
      uploadedBy: s.pgUserId,
    });
    const ok = await canAccessAttachment(
      att,
      { user: { id: s.buyerUserId, workspaceId: s.buyerWsId, workspaceType: 'buyer' } },
      await repos(),
    );
    expect(ok).toBe(false);
  });

  it('DENY for a random unrelated user (no wsId)', async () => {
    const s = await seedScenario();
    const att = await seedTemplateAtt({
      pgWsId: s.pgWsId,
      createdBy: s.pgUserId,
      uploadedBy: s.pgUserId,
    });
    const ok = await canAccessAttachment(att, { user: { id: s.randomUserId } }, await repos());
    expect(ok).toBe(false);
  });

  it('ALLOW for the uploader regardless of workspace (draft window before save)', async () => {
    const s = await seedScenario();
    const att = await seedTemplateAtt({
      pgWsId: s.pgWsId,
      createdBy: s.pgUserId,
      uploadedBy: s.pgUserId,
    });
    const ok = await canAccessAttachment(
      att,
      { user: { id: s.pgUserId, workspaceId: s.otherPgWsId, workspaceType: 'pg' } },
      await repos(),
    );
    expect(ok).toBe(true);
  });

  it('DENY when the referenced template row is missing (orphan contractTemplateId)', async () => {
    const s = await seedScenario();
    const orphanAtt: AttachmentRow = {
      id: randomUUID(),
      contractTemplateId: randomUUID(),
      name: 'template.pdf',
      size: 90,
      mimeType: 'application/pdf',
      url: '',
      uploadedBy: s.buyerUserId, // not the requesting user — fast-path does not fire
    };
    const ok = await canAccessAttachment(
      orphanAtt,
      { user: { id: s.pgUserId, workspaceId: s.pgWsId, workspaceType: 'pg' } },
      await repos(),
    );
    expect(ok).toBe(false);
  });
});
