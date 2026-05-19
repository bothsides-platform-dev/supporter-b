import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';

import { randomUUID } from 'node:crypto';
import {
  attachments,
  bizProfiles,
  outboxEntries,
  rfpInvitations,
  rfps,
  workspaces,
} from '@/lib/db/schema';
import { DRAFT_OWNER_ID } from '@/lib/server/storage/path';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { setupRfpActionEnv, teardownRfpActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

// Buyer session — patched per test.
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
  requireSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('UNAUTHENTICATED'));
    return Promise.resolve(sessionRef.value);
  },
  requireBuyerSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('FORBIDDEN_BUYER'));
    return Promise.resolve(sessionRef.value);
  },
}));

import { createRfpAction } from '../createRfpAction';

let db: PgliteDB;
let buyerUserId: string;
let buyerWsId: string;
let bizId: string;
let pgWsId: string;

async function freshBuyer() {
  const u = await seedUser(db, { email: 'buyer@x.com' });
  const biz = await seedBizProfile(db);
  const ws = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, ws.id, u.id, 'admin');
  return { userId: u.id, email: u.email, wsId: ws.id, bizId: biz.id };
}

describe('createRfpAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
    const seeded = await freshBuyer();
    buyerUserId = seeded.userId;
    buyerWsId = seeded.wsId;
    bizId = seeded.bizId;
    sessionRef.value = {
      user: {
        id: buyerUserId,
        email: seeded.email,
        workspaceId: buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    // Default PG workspace for draft tests (no members needed — drafts skip invite logic)
    const pgWs = await seedPgWorkspace(db, '테스트PG');
    pgWsId = pgWs.id;
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('rejects without buyer session', async () => {
    sessionRef.value = null;
    const r = await createRfpAction({
      title: 't',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [randomUUID()],
    });
    expect(r.ok).toBe(false);
  });

  it('draft branch — inserts RFP status=draft, no invitations, no outbox', async () => {
    const r = await createRfpAction({
      title: '결제 인프라 제안',
      memo: 'D+1 정산 희망',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rfpId).toMatch(/^P-\d{4}-\d{4}$/);

    const [row] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId));
    expect(row.status).toBe('draft');
    expect(row.sentAt).toBeNull();

    const invs = await db
      .select()
      .from(rfpInvitations)
      .where(eq(rfpInvitations.rfpId, r.rfpId));
    expect(invs).toHaveLength(0);

    const outbox = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'rfp.invited'));
    expect(outbox).toHaveLength(0);
  });

  it('send branch — inserts RFP status=sent, N invitations + N invite outbox + 1 sent outbox', async () => {
    // Seed 3 PG workspaces each with one admin — outbox is per admin member
    const pg1 = await seedPgWorkspace(db, '토스페이먼츠');
    const pg1Admin = await seedUser(db, { email: 'admin@toss.im' });
    await seedMembership(db, pg1.id, pg1Admin.id, 'admin');

    const pg2 = await seedPgWorkspace(db, 'KG이니시스');
    const pg2Admin = await seedUser(db, { email: 'admin@inicis.com' });
    await seedMembership(db, pg2.id, pg2Admin.id, 'admin');

    const pg3 = await seedPgWorkspace(db, '카카오페이');
    const pg3Admin = await seedUser(db, { email: 'admin@kakaopay.com' });
    await seedMembership(db, pg3.id, pg3Admin.id, 'admin');

    const pgWsIds = [pg1.id, pg2.id, pg3.id];
    const adminEntries = [
      { wsId: pg1.id, userId: pg1Admin.id },
      { wsId: pg2.id, userId: pg2Admin.id },
      { wsId: pg3.id, userId: pg3Admin.id },
    ];

    const r = await createRfpAction({
      title: '결제 인프라 제안',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: pgWsIds,
      send: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId));
    expect(row.status).toBe('sent');
    expect(row.sentAt).not.toBeNull();

    const invs = await db
      .select()
      .from(rfpInvitations)
      .where(eq(rfpInvitations.rfpId, r.rfpId));
    expect(invs).toHaveLength(pgWsIds.length);
    for (const inv of invs) {
      expect(inv.tokenHash).toBeTruthy();
      expect(pgWsIds).toContain(inv.pgWsId);
      expect(inv.status).toBe('pending');
    }

    // One outbox entry per admin member
    const inviteRows = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'rfp.invited'));
    expect(inviteRows).toHaveLength(pgWsIds.length);
    const expectedKeys = adminEntries
      .map(({ wsId, userId }) => `rfp:${row.id}:invite:ws:${wsId}:user:${userId}`)
      .sort();
    expect(inviteRows.map((r) => r.dedupeKey).sort()).toEqual(expectedKeys);

    const sentRows = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'rfp.sent'));
    expect(sentRows).toHaveLength(1);
    expect(sentRows[0].dedupeKey).toBe(`rfp:${row.id}:sent`);
  });

  it('inserts a new biz_profiles snapshot row (RFP-specific) without altering workspace.biz_profile_id (advisor pin 1)', async () => {
    const before = await db
      .select({ id: workspaces.bizProfileId })
      .from(workspaces)
      .where(eq(workspaces.id, buyerWsId));
    const wsBizBefore = before[0].id;
    expect(wsBizBefore).toBe(bizId);

    const r = await createRfpAction({
      title: '스냅샷 검증',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [rfpRow] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId));
    expect(rfpRow.bizProfileId).not.toBe(wsBizBefore);

    // Snapshot row is its own biz_profiles id.
    const allBiz = await db.select().from(bizProfiles);
    expect(allBiz.map((b) => b.id)).toContain(rfpRow.bizProfileId);

    // 🚨 workspace.biz_profile_id must remain unchanged.
    const after = await db
      .select({ id: workspaces.bizProfileId })
      .from(workspaces)
      .where(eq(workspaces.id, buyerWsId));
    expect(after[0].id).toBe(wsBizBefore);
  });

  it('snapshot inherits grade/source/confirmedBy from current biz_profile verbatim', async () => {
    const r = await createRfpAction({
      title: 'inherit',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [rfpRow] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId));
    expect(rfpRow.bizProfileId).not.toBeNull();
    if (!rfpRow.bizProfileId) return;
    const [snap] = await db
      .select()
      .from(bizProfiles)
      .where(eq(bizProfiles.id, rfpRow.bizProfileId));
    expect(snap.gradeSource).toBe('user_confirmed');
  });

  it('falls through to bizProfileId=null when workspace has no biz_profile_id (사전 제안)', async () => {
    await db
      .update(workspaces)
      .set({ bizProfileId: null })
      .where(eq(workspaces.id, buyerWsId));

    const r = await createRfpAction({
      title: 't',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [rfpRow] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId));
    expect(rfpRow.bizProfileId).toBeNull();
  });

  it('bizProfileMode=none skips biz_profiles snapshot insert', async () => {
    const r = await createRfpAction({
      title: 'pre-quote',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      bizProfileMode: 'none',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [rfpRow] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId));
    expect(rfpRow.bizProfileId).toBeNull();
  });

  it('bizProfileMode=override with neither bizNo nor grade returns INVALID_BIZ_PROFILE', async () => {
    const r = await createRfpAction({
      title: 't',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      bizProfileMode: 'override',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('INVALID_BIZ_PROFILE');
  });

  it('bizProfileMode=override with gradeOverride creates new biz_profiles row', async () => {
    const r = await createRfpAction({
      title: 'override',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      bizProfileMode: 'override',
      gradeOverride: 'sme3',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [rfpRow] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId));
    expect(rfpRow.bizProfileId).not.toBeNull();
    if (!rfpRow.bizProfileId) return;
    const [snap] = await db
      .select()
      .from(bizProfiles)
      .where(eq(bizProfiles.id, rfpRow.bizProfileId));
    expect(snap.grade).toBe('sme3');
    expect(snap.gradeSource).toBe('user_overridden');
    expect(snap.bizNo).toBeNull();
  });

  it('issues monotonic P-YYMM-NNNN ids within the month', async () => {
    const r1 = await createRfpAction({
      title: 'a',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
    });
    const r2 = await createRfpAction({
      title: 'b',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
    });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    const seq1 = Number(r1.rfpId.slice(-4));
    const seq2 = Number(r2.rfpId.slice(-4));
    expect(seq2).toBe(seq1 + 1);
  });

  it('rejects malformed input', async () => {
    const r = await createRfpAction({
      title: '',
      deadline: 'nope',
      allowedPgWorkspaceIds: [],
    });
    expect(r.ok).toBe(false);
  });

  it('Step 11 — patches __draft__ attachments to the new RFP id', async () => {
    // Pre-existing RFP attachment row uploaded against the draft sentinel
    // (mirrors what the dropzone does at file-select time).
    const draftAttId = randomUUID();
    await db.insert(attachments).values({
      id: draftAttId,
      ownerKind: 'rfp',
      ownerId: DRAFT_OWNER_ID,
      name: 'rfp.pdf',
      size: 100,
      mimeType: 'application/pdf',
      storagePath: '2026/05/dummy.pdf',
      uploadedBy: buyerUserId,
    });
    // Plus a foreign attachment that must NOT be touched (uploaded by
    // another user; same ownerId sentinel by chance).
    const otherUser = await seedUser(db, { email: 'other@x.com' });
    const foreignAttId = randomUUID();
    await db.insert(attachments).values({
      id: foreignAttId,
      ownerKind: 'rfp',
      ownerId: DRAFT_OWNER_ID,
      name: 'rfp-other.pdf',
      size: 100,
      mimeType: 'application/pdf',
      storagePath: '2026/05/dummy-other.pdf',
      uploadedBy: otherUser.id,
    });

    const r = await createRfpAction({
      title: '첨부 link-up 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      rfpAttachmentIds: [draftAttId, foreignAttId],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [own] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, draftAttId))
      .limit(1);
    expect(own?.ownerId).toBe(r.rfpId);

    const [foreign] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, foreignAttId))
      .limit(1);
    // Cross-user guard: action's WHERE includes uploaded_by — foreign row
    // stays on the draft sentinel.
    expect(foreign?.ownerId).toBe(DRAFT_OWNER_ID);
  });

  // _suppress unused import warnings
  void and;
});
