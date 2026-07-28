/**
 * E2E helper surface — kept minimal on purpose. The existing `scenario-*`
 * specs each duplicate the 6-line form login and ad-hoc `db.execute(sql\`...\`)`
 * queries; new Stage 3 specs would compound that. These helpers collapse the
 * boilerplate into one source so future specs stay focused on assertions.
 *
 * Test DB resolution: playwright.config.ts:webServer pins DATABASE_URL to
 * 5433/supporter_b_test, and individual specs also set `process.env.DATABASE_URL`
 * for any direct DB access (see scenario-a/b/c). We mirror that pattern.
 */
import type { Page } from 'playwright/test';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { db } from '@/lib/db/client';
import { attachments, bids, columns, rfps } from '@/lib/db/schema';
import { getStorage } from '@/lib/server/storage';

// Seed/URL identifiers are the human RFP code (P-YYMM-NNNN); FKs use the uuid.
export async function rfpUuidFromCode(code: string): Promise<string> {
  const [row] = await db
    .select({ id: rfps.id })
    .from(rfps)
    .where(eq(rfps.code, code))
    .limit(1);
  if (!row) throw new Error(`[e2e helpers] rfp not found: ${code}`);
  return row.id;
}
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://supporter_b:supporter_b@localhost:5433/supporter_b_test';

// `getStorage()` now requires real R2 config (R2_* env) in every
// environment — no dev/test fallback backend. playwright.config.ts
// passes the same R2_* vars through to the webServer, so this process
// and the server-under-test share a bucket when R2 env is present.
// Callers of `attachTossProposalPdf` must skip their spec when it's
// absent (see e2e/bid-detail-pdf-preview.spec.ts).

// Plaintext credentials from scripts/seed.ts:58, 91-94. Centralised so
// future spec churn (e.g. renaming a workspace) needs one edit.
const CREDENTIALS: Record<Role, { email: string; password: string }> = {
  buyer: { email: 'yeonseong.dev@gmail.com', password: 'password123' },
  'pg-toss': { email: 'ws-toss-admin@example.com', password: 'password123' },
  'pg-inicis': { email: 'ws-inicis-admin@example.com', password: 'password123' },
  'pg-kakao': { email: 'ws-kakao-admin@example.com', password: 'password123' },
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
  // dev 서버 cold-compile(login→home 트리)는 15s 를 넘길 수 있어 여유를 둔다.
  // prod 빌드(CI)는 사전컴파일이라 즉시 통과 — 더 길게 잡아도 무해하다.
  await page.waitForURL(/\/home$/, { timeout: 45_000 });
}

/** 시드 계정 이메일 단일 출처 — 스펙마다 리터럴을 복제하지 않는다. */
export function emailFor(role: Role): string {
  return CREDENTIALS[role].email;
}

// ─── 온보딩 튜토리얼 공용 헬퍼 ───────────────────────────────────────────────
// tutorial-click-through(본여정)와 tutorial-entry-points(진입면)가 공유한다.

/** /tutorial 은 완료 스탬프가 있으면 /home 으로 돌려보낸다 — 각 여정 전 초기화. */
export async function resetOnboarding(email: string): Promise<void> {
  await db.execute(sql`UPDATE users SET onboarding = '{}'::jsonb WHERE email = ${email}`);
}

export async function onboardingDoc(email: string): Promise<Record<string, unknown>> {
  const rows = (await db.execute(
    sql`SELECT onboarding FROM users WHERE email = ${email}`,
  )) as unknown as Array<{ onboarding: Record<string, unknown> }>;
  return rows[0]?.onboarding ?? {};
}

/** 코치마크가 해당 타깃을 가리킬 때(링 표시) 실제 버튼을 클릭한다. */
export async function clickThrough(page: Page, target: string): Promise<void> {
  const el = page.locator(`[data-coachmark="${target}"]`);
  await el.waitFor({ state: 'visible', timeout: 15_000 });
  await page
    .locator('[data-slot="coachmark-ring"]')
    .waitFor({ state: 'visible', timeout: 15_000 });
  await el.click();
}

/** info 말풍선(읽고 다음 모델)을 닫는다. */
export async function dismissInfo(page: Page): Promise<void> {
  const next = page.locator('[role="dialog"]').getByRole('button', { name: /^(다음|확인)$/ });
  await next.waitFor({ state: 'visible', timeout: 15_000 });
  await next.click();
}

export async function enterTutorial(page: Page, role: Role): Promise<void> {
  await loginAs(page, role);
  await page.goto('/tutorial');
  await page.waitForURL(/\/tutorial$/, { timeout: 30_000 });
}

/** Title of the column a bid currently sits in (unified kanban). A bid with no
 *  board_column_id falls back to the default-landing column "진행전".
 *  Throws if the bid doesn't exist so the spec fails loud. */
export async function getBidColumnTitleFromDb(bidId: string): Promise<string> {
  const [row] = await db
    .select({ boardColumnId: bids.boardColumnId, title: columns.title })
    .from(bids)
    .leftJoin(columns, eq(bids.boardColumnId, columns.id))
    .where(eq(bids.id, bidId))
    .limit(1);
  if (!row) throw new Error(`[e2e helpers] bid not found: ${bidId}`);
  return row.boardColumnId ? (row.title ?? '진행전') : '진행전';
}

/** Reset the seeded P-2604-0001 RFP back to a runnable state for a new spec
 *  run (status='sent', all bids back to the default-landing column by clearing
 *  their bid_placements). Idempotent. */
export async function resetRfpForKanban(rfpCode: string): Promise<void> {
  const rfpId = await rfpUuidFromCode(rfpCode);
  await db.execute(
    sql`UPDATE rfps SET status='sent', awarded_bid_id=NULL WHERE id=${rfpId}`,
  );
  await db.execute(sql`DELETE FROM contracts WHERE rfp_id=${rfpId}`);
  // Clear explicit placements → all bids fall back to "진행전".
  await db.execute(sql`
    UPDATE bids SET board_column_id = NULL WHERE rfp_id = ${rfpId}
  `);
  // Clear any bid_notes rows left over from a previous note spec.
  await db.execute(sql`
    DELETE FROM bid_notes
    WHERE bid_id IN (SELECT id FROM bids WHERE rfp_id = ${rfpId})
  `);
}

/** Look up the toss/inicis bid ids for P-2604-0001. Stage 3 specs need
 *  the actual UUIDs (the seed generates randomUUID() so they're not
 *  hard-coded). Returns { toss, inicis } both required to exist. */
export async function findSeededBidIds(rfpCode: string): Promise<{
  toss: string;
  inicis: string;
}> {
  const rfpId = await rfpUuidFromCode(rfpCode);
  const rows = await db
    .select({
      id: bids.id,
      pgWsId: bids.pgWsId,
      pgName: sql<string>`(SELECT name FROM workspaces WHERE id = ${bids.pgWsId})`,
    })
    .from(bids)
    .where(eq(bids.rfpId, rfpId));
  const toss = rows.find((r) => r.pgName === '서포터 B 페이');
  const inicis = rows.find((r) => r.pgName === 'KG이니시스');
  if (!toss || !inicis) {
    throw new Error(
      `[e2e helpers] expected toss + inicis bids on ${rfpCode}; got ${rows.length} bids`,
    );
  }
  return { toss: toss.id, inicis: inicis.id };
}

// Minimal valid PDF — small enough to inline, big enough that the browser
// renders it as an empty page in the iframe preview. Specs that need an
// attached file (e.g. bid-detail-pdf-preview.spec.ts) upload these bytes
// via `attachTossProposalPdf` so the shared R2 bucket actually carries
// the object (their spec must skip when R2 env is absent).
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
 *  call this in their `beforeAll`. Writes through `getStorage()`, which now
 *  requires real R2 config (R2_* env) in every environment — there is no
 *  dev/test fallback backend — so the webServer process can read back what
 *  this process wrote. Callers must skip their spec when R2 env is absent
 *  (see e2e/bid-detail-pdf-preview.spec.ts). Returns the new attachment id,
 *  which `bids.proposalAttachmentId` is also updated to. */
export async function attachTossProposalPdf(rfpCode: string): Promise<string> {
  // URL/seed 식별자는 code — bids.rfpId(uuid) 매칭 위해 먼저 해석.
  const [rfpRow] = await db
    .select({ id: rfps.id })
    .from(rfps)
    .where(eq(rfps.code, rfpCode))
    .limit(1);
  if (!rfpRow) throw new Error(`[e2e helpers] rfp not found: ${rfpCode}`);

  const [tossBid] = await db
    .select({ id: bids.id, submittedBy: bids.submittedBy })
    .from(bids)
    .where(
      sql`${bids.rfpId} = ${rfpRow.id} AND ${bids.pgWsId} = (
        SELECT id FROM workspaces WHERE name = '서포터 B 페이'
      )`,
    )
    .limit(1);
  if (!tossBid) {
    throw new Error(`[e2e helpers] toss bid not found on ${rfpCode}`);
  }

  // exclusive-arc: 제안서 첨부는 bid_id 로 링크. metadata-먼저 → blob(키=attachment id, C4).
  const attachmentId = randomUUID();
  await db.insert(attachments).values({
    id: attachmentId,
    bidId: tossBid.id,
    name: '제안서_서포터B.pdf',
    size: MINIMAL_PDF.length,
    mimeType: 'application/pdf',
    uploadedBy: tossBid.submittedBy!,
  });
  await getStorage().save(attachmentId, MINIMAL_PDF, 'application/pdf');
  return attachmentId;
}

