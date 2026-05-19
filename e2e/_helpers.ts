/**
 * E2E helper surface — kept minimal on purpose. The existing `scenario-*`
 * specs each duplicate the 6-line form login and ad-hoc `db.execute(sql\`...\`)`
 * queries; new Stage 3 specs would compound that. These helpers collapse the
 * boilerplate into one source so future specs stay focused on assertions.
 *
 * Test DB resolution: playwright.config.ts:webServer pins DATABASE_URL to
 * 5433/bidit_test, and individual specs also set `process.env.DATABASE_URL`
 * for any direct DB access (see scenario-a/b/c). We mirror that pattern.
 */
import type { Page } from 'playwright/test';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { db } from '@/lib/db/client';
import { attachments, bids, bidNotes } from '@/lib/db/schema';
import { getStorage } from '@/lib/server/storage';
import { newAttachmentPath } from '@/lib/server/storage/path';
import type { BuyerStage } from '@/lib/types/bid';

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://bidit:bidit@localhost:5433/bidit_test';

// Plaintext credentials from scripts/seed.ts:58, 91-94. Centralised so
// future spec churn (e.g. renaming a workspace) needs one edit.
const CREDENTIALS: Record<Role, { email: string; password: string }> = {
  buyer: { email: 'yeonseong.dev@gmail.com', password: 'password123' },
  'pg-toss': { email: 'ws-toss-admin@toss.im', password: 'password123' },
  'pg-inicis': { email: 'ws-inicis-admin@inicis.com', password: 'password123' },
  'pg-kakao': { email: 'ws-kakao-admin@kakaopay.com', password: 'password123' },
};

export type Role = 'buyer' | 'pg-toss' | 'pg-inicis' | 'pg-kakao';

/**
 * Visit /login, fill the form, click 로그인, and wait for redirect into the
 * authed shell. PG and buyer both land at /home post-login (the share-link
 * and invitation flows take different paths but those have their own specs).
 */
export async function loginAs(page: Page, role: Role): Promise<void> {
  const { email, password } = CREDENTIALS[role];
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL(/\/home$/, { timeout: 15_000 });
}

/** Strict DB read for kanban stage; throws if the bid doesn't exist so the
 *  spec fails loud instead of silently asserting against undefined. */
export async function getBuyerStageFromDb(bidId: string): Promise<BuyerStage> {
  const [row] = await db
    .select({ buyerStage: bids.buyerStage })
    .from(bids)
    .where(eq(bids.id, bidId))
    .limit(1);
  if (!row) throw new Error(`[e2e helpers] bid not found: ${bidId}`);
  return row.buyerStage;
}

/** Number of bid_notes rows for a given bid. Used by the note roundtrip
 *  spec to gate UI-vs-DB invariants. */
export async function getNoteCountFromDb(bidId: string): Promise<number> {
  const rows = await db
    .select({ id: bidNotes.id })
    .from(bidNotes)
    .where(eq(bidNotes.bidId, bidId));
  return rows.length;
}

/** Reset the seeded P-2604-0001 RFP back to a runnable state for a new spec
 *  run (status='sent', all bids back to 'pending'). Idempotent. */
export async function resetRfpForKanban(rfpId: string): Promise<void> {
  await db.execute(
    sql`UPDATE rfps SET status='sent', awarded_bid_id=NULL WHERE id=${rfpId}`,
  );
  await db.execute(sql`DELETE FROM contracts WHERE rfp_id=${rfpId}`);
  await db
    .update(bids)
    .set({ buyerStage: 'pending' })
    .where(eq(bids.rfpId, rfpId));
  // Clear any bid_notes rows left over from a previous note spec.
  await db.execute(sql`
    DELETE FROM bid_notes
    WHERE bid_id IN (SELECT id FROM bids WHERE rfp_id = ${rfpId})
  `);
}

/** Look up the toss/inicis bid ids for P-2604-0001. Stage 3 specs need
 *  the actual UUIDs (the seed generates randomUUID() so they're not
 *  hard-coded). Returns { toss, inicis } both required to exist. */
export async function findSeededBidIds(rfpId: string): Promise<{
  toss: string;
  inicis: string;
}> {
  const rows = await db
    .select({
      id: bids.id,
      pgWsId: bids.pgWsId,
      pgName: sql<string>`(SELECT name FROM workspaces WHERE id = ${bids.pgWsId})`,
    })
    .from(bids)
    .where(eq(bids.rfpId, rfpId));
  const toss = rows.find((r) => r.pgName === '토스페이먼츠');
  const inicis = rows.find((r) => r.pgName === 'KG이니시스');
  if (!toss || !inicis) {
    throw new Error(
      `[e2e helpers] expected toss + inicis bids on ${rfpId}; got ${rows.length} bids`,
    );
  }
  return { toss: toss.id, inicis: inicis.id };
}

// Minimal valid PDF — small enough to inline, big enough that the browser
// renders it as an empty page in the iframe preview. Specs that need an
// attached file (e.g. bid-detail-pdf-preview.spec.ts) upload these bytes
// via `attachTossProposalPdf` so the storage backend (Supabase locally,
// Supabase in prod) actually carries the object.
const MINIMAL_PDF = Buffer.from(
  [
    '%PDF-1.4',
    '1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj',
    '2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj',
    '3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 100 100]>> endobj',
    'xref',
    '0 4',
    '0000000000 65535 f',
    '0000000009 00000 n',
    '0000000056 00000 n',
    '0000000111 00000 n',
    'trailer <</Size 4 /Root 1 0 R>>',
    'startxref',
    '177',
    '%%EOF',
    '',
  ].join('\n'),
  'utf8',
);

/** Idempotently attach a fresh bid_proposal PDF to the toss bid on the given
 *  RFP. Replaces the seed's old `withAttachment: true` path — the seed no
 *  longer creates attachments, so specs that need iframe-renderable bytes
 *  call this in their `beforeAll`. Writes to whatever Storage backend
 *  `getStorage()` returns (Supabase locally + prod). Returns the new
 *  attachment id, which `bids.proposalAttachmentId` is also updated to. */
export async function attachTossProposalPdf(rfpId: string): Promise<string> {
  const [tossBid] = await db
    .select({ id: bids.id, submittedBy: bids.submittedBy })
    .from(bids)
    .where(
      sql`${bids.rfpId} = ${rfpId} AND ${bids.pgWsId} = (
        SELECT id FROM workspaces WHERE name = '토스페이먼츠'
      )`,
    )
    .limit(1);
  if (!tossBid) {
    throw new Error(`[e2e helpers] toss bid not found on ${rfpId}`);
  }

  const attachmentId = randomUUID();
  const storageKey = newAttachmentPath('제안서_토스.pdf');
  await getStorage().save(storageKey, MINIMAL_PDF, 'application/pdf');
  await db.insert(attachments).values({
    id: attachmentId,
    ownerKind: 'bid_proposal',
    ownerId: rfpId,
    name: '제안서_토스.pdf',
    size: MINIMAL_PDF.length,
    mimeType: 'application/pdf',
    storagePath: storageKey,
    uploadedBy: tossBid.submittedBy!,
  });
  await db
    .update(bids)
    .set({ proposalAttachmentId: attachmentId })
    .where(eq(bids.id, tossBid.id));
  return attachmentId;
}

