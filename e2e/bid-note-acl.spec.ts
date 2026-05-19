/**
 * bid_note attachment ACL — Stage 3b verification.
 *
 * canAccessAttachment's `bid_note` branch must ALLOW buyer workspace members
 * and DENY every PG (notes are buyer-private). The action layer wraps
 * `requireBuyerSession` so PG can't even reach the action — but the file
 * route is what the *iframe* hits. A PG who guesses an attachment id and
 * loads `/api/files/{id}` must get 403, not the bytes.
 *
 * This spec creates a real note + attachment as the buyer (via the UI to
 * mirror the production path), then reads the attachment id from the DB,
 * clears the session, logs in as toss PG, and hits the file route with
 * page.request. Expect 403.
 */
import { test, expect } from 'playwright/test';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { attachments, bidNotes } from '@/lib/db/schema';

import {
  findSeededBidIds,
  loginAs,
  resetRfpForKanban,
} from './_helpers';

process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://bidit:bidit@localhost:5433/bidit_test';

const RFP_ID = 'P-2604-0001';
const SAMPLE_PDF = Buffer.from(
  ['%PDF-1.4', '%%EOF', ''].join('\n'),
  'utf8',
);

test.describe.serial('bid_note attachment ACL', () => {
  test.beforeAll(async () => {
    await resetRfpForKanban(RFP_ID);
  });

  test('buyer can read; PG (toss + inicis) get 403', async ({ page }) => {
    const { toss: tossBidId } = await findSeededBidIds(RFP_ID);

    // ─── Buyer creates a note with attachment via UI ───────────────────
    await loginAs(page, 'buyer');
    await page.goto(`/rfp/${RFP_ID}`);
    await page.getByRole('tab', { name: '[ 보드 ]' }).click();
    await page.getByRole('button', { name: /토스페이먼츠/ }).first().click();

    const uploadResp = page.waitForResponse(
      (r) =>
        r.url().includes('/api/files/upload') &&
        r.request().method() === 'POST',
    );
    await page.setInputFiles('input[type="file"]', {
      name: 'acl-memo.pdf',
      mimeType: 'application/pdf',
      buffer: SAMPLE_PDF,
    });
    await uploadResp;
    await page.getByPlaceholder(/협상 진행/).fill('ACL 검증용 메모');
    await page.getByRole('button', { name: '기록' }).click();

    // Wait for the action to commit (note row exists).
    await expect
      .poll(
        async () => {
          const rows = await db
            .select({ id: bidNotes.id })
            .from(bidNotes)
            .where(eq(bidNotes.bidId, tossBidId));
          return rows.length;
        },
        { timeout: 5_000 },
      )
      .toBe(1);

    // Pull the attachment id straight from the DB — owner_id is the new
    // note row's id after addBidNoteAction's owner_id patch.
    const [noteRow] = await db
      .select({ id: bidNotes.id })
      .from(bidNotes)
      .where(eq(bidNotes.bidId, tossBidId))
      .limit(1);
    const [attRow] = await db
      .select({ id: attachments.id })
      .from(attachments)
      .where(
        and(
          eq(attachments.ownerKind, 'bid_note'),
          eq(attachments.ownerId, noteRow.id),
        ),
      )
      .limit(1);
    expect(attRow?.id).toBeDefined();
    const attId = attRow.id;

    // ─── Buyer session — direct API hit returns 200 ────────────────────
    const buyerRead = await page.request.get(`/api/files/${attId}`);
    expect(buyerRead.status()).toBe(200);

    // ─── Switch to toss PG — same attachment, must be 403 ──────────────
    await page.context().clearCookies();
    await loginAs(page, 'pg-toss');
    const tossRead = await page.request.get(`/api/files/${attId}`);
    expect(tossRead.status()).toBe(403);

    // ─── Switch to inicis PG — also 403 (cross-PG isolation) ───────────
    await page.context().clearCookies();
    await loginAs(page, 'pg-inicis');
    const inicisRead = await page.request.get(`/api/files/${attId}`);
    expect(inicisRead.status()).toBe(403);
  });
});
