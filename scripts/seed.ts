/**
 * scripts/seed.ts — idempotent dev/test seed.
 *
 * Run via `pnpm db:seed` (= `tsx scripts/seed.ts`) against the local Docker
 * Postgres. Also imported by `scripts/__tests__/seed.test.ts` which passes a
 * pglite handle to `runSeed(db)` for fast in-process verification.
 *
 * Strategy: TRUNCATE all 13 tables CASCADE RESTART IDENTITY in one statement
 * (FK order resolved by CASCADE), then bulk INSERT. Re-running drops and
 * recreates everything — safe to call repeatedly during development.
 *
 * NOTE on credentials: `password123` is **dev-only**. Production seeding
 * never runs this script; passwords are hashed with bcrypt cost=12 via the
 * shared `lib/auth/password.ts` helper.
 */
import 'dotenv/config';

import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  attachments,
  bids,
  bizProfiles,
  rfpCounters,
  rfpInvitations,
  rfps,
  users,
  workspaceMembers,
  workspaces,
} from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { generateToken, hashToken } from '@/lib/server/token';
import type { DB } from '@/lib/db/client';
import type { PgliteDB } from '@/lib/db/client-pglite';

// Accept either prod postgres-js drizzle handle or test pglite handle. The
// schema imports are identical so the same statements compile against both.
type AnyDb = DB | PgliteDB;

export type SeedResult = {
  workspaces: number;
  users: number;
  members: number;
  bizProfiles: number;
  rfps: number;
  invitations: number;
  bids: number;
  contracts: number;
  notifications: number;
  outbox: number;
  attachments: number;
  verificationTokens: number;
  rfpCounters: number;
  loginCredentials: { email: string; password: string }[];
};

const PASSWORD_PLAINTEXT = 'password123';

// Minimal valid PDF — used by `runSeed({ withAttachment: true })` to give
// E2E specs (and a curious dev) an iframe-loadable file behind the toss
// bid on P-2604-0001. Browsers render this as a blank page but the
// /api/files/[id] route serves it with Content-Type: application/pdf,
// which is all the iframe + ETag tests assert.
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

function uploadDirAbs(): string {
  const raw = process.env.UPLOAD_DIR ?? './uploads';
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

export type RunSeedOptions = {
  /** When true, seeds a bid_proposal attachment for the toss bid on
   *  P-2604-0001 and writes the PDF body to `${UPLOAD_DIR}/2026/05/<uuid>.pdf`.
   *  E2E uses this; the pglite unit test in scripts/__tests__/seed.test.ts
   *  defaults to false so its existing row-count assertions still hold. */
  withAttachment?: boolean;
};

export async function runSeed(
  db: AnyDb,
  options: RunSeedOptions = {},
): Promise<SeedResult> {
  // 1. TRUNCATE everything in one CASCADE — FK order doesn't matter.
  // RESTART IDENTITY also covers the rfp_counters integer (though the table
  // has no serial). All 13 tables explicitly listed for grep visibility.
  await db.execute(sql`
    TRUNCATE TABLE
      contracts,
      bids,
      rfp_invitations,
      rfps,
      attachments,
      notifications,
      outbox_entries,
      verification_tokens,
      rfp_counters,
      workspace_members,
      biz_profiles,
      users,
      workspaces
    RESTART IDENTITY CASCADE
  `);

  // 2. Hash the shared dev password once.
  const passwordHash = await hashPassword(PASSWORD_PLAINTEXT);

  // 3. Users — 1 buyer admin + 3 PG admins. Stable UUIDs so re-runs match.
  const buyerUserId = randomUUID();
  const tossUserId = randomUUID();
  const inicisUserId = randomUUID();
  const kakaoUserId = randomUUID();

  const buyerEmail = 'yeonseong.dev@gmail.com';
  const tossEmail = 'ws-toss-admin@toss.im';
  const inicisEmail = 'ws-inicis-admin@inicis.com';
  const kakaoEmail = 'ws-kakao-admin@kakaopay.com';

  await db.insert(users).values([
    {
      id: buyerUserId,
      email: buyerEmail,
      passwordHash,
      name: '이성연',
      avatarColor: 'accent',
    },
    {
      id: tossUserId,
      email: tossEmail,
      passwordHash,
      name: '토스 관리자',
      avatarColor: 'lavender',
    },
    {
      id: inicisUserId,
      email: inicisEmail,
      passwordHash,
      name: '이니시스 관리자',
      avatarColor: 'moss',
    },
    {
      id: kakaoUserId,
      email: kakaoEmail,
      passwordHash,
      name: '카카오페이 관리자',
      avatarColor: 'amber',
    },
  ]);

  // 4. Biz profiles — buyer ws bizProfile + 1 shared RFP snapshot.
  // Note: bizProfile rows are immutable. The same snapshot row is referenced
  // by both the sent RFP and the draft RFP since the underlying biz state
  // didn't change between them — saves a row at no semantic cost.
  const buyerBizId = randomUUID();
  const rfpSnapshotBizId = randomUUID();

  await db.insert(bizProfiles).values([
    {
      id: buyerBizId,
      bizNo: '123-45-67890',
      taxType: 'general',
      status: 'active',
      grade: 'sme2',
      gradeSource: 'user_confirmed',
      gradeConfirmedBy: buyerUserId,
      gradeConfirmedAt: new Date(),
    },
    {
      id: rfpSnapshotBizId,
      bizNo: '123-45-67890',
      taxType: 'general',
      status: 'active',
      grade: 'sme2',
      gradeSource: 'user_confirmed',
      gradeConfirmedBy: buyerUserId,
      gradeConfirmedAt: new Date(),
    },
  ]);

  // 5. Workspaces — 1 buyer (no domain, biz_profile_id set) + 3 PG (domain set,
  // biz_profile_id NULL since PG workspaces don't carry merchant biz info).
  const buyerWsId = randomUUID();
  const tossWsId = randomUUID();
  const inicisWsId = randomUUID();
  const kakaoWsId = randomUUID();

  await db.insert(workspaces).values([
    {
      id: buyerWsId,
      type: 'buyer',
      name: '(주)샘플테크',
      bizProfileId: buyerBizId,
    },
    {
      id: tossWsId,
      type: 'pg',
      name: '토스페이먼츠',
    },
    {
      id: inicisWsId,
      type: 'pg',
      name: 'KG이니시스',
    },
    {
      id: kakaoWsId,
      type: 'pg',
      name: '카카오페이',
    },
  ]);

  // 6. Memberships — each user is admin of their own workspace.
  await db.insert(workspaceMembers).values([
    { workspaceId: buyerWsId, userId: buyerUserId, role: 'admin' },
    { workspaceId: tossWsId, userId: tossUserId, role: 'admin' },
    { workspaceId: inicisWsId, userId: inicisUserId, role: 'admin' },
    { workspaceId: kakaoWsId, userId: kakaoUserId, role: 'admin' },
  ]);

  // 7. RFPs — counters first so the FK / numbering is consistent on direct
  // inserts (we bypass nextRfpId() because it derives YYMM from `now()`).
  await db.insert(rfpCounters).values([
    { yearMonth: '2604', lastSeq: 1 },
    { yearMonth: '2605', lastSeq: 2 },
  ]);

  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 3_600_000);
  const sentAt = new Date(now.getTime() - 24 * 3_600_000); // sent yesterday

  await db.insert(rfps).values([
    {
      id: 'P-2604-0001',
      buyerWsId,
      bizProfileId: rfpSnapshotBizId,
      title: '2026년 4월 PG 입찰',
      memo: '월 매출 1억 규모, 카드 + 간편결제 위주',
      allowedPgWorkspaceIds: [tossWsId, inicisWsId, kakaoWsId],
      deadline: sevenDays,
      status: 'sent',
      createdBy: buyerUserId,
      sentAt,
    },
    {
      id: 'P-2605-0001',
      buyerWsId,
      bizProfileId: rfpSnapshotBizId,
      title: '2026년 5월 PG 입찰 (초안)',
      memo: '',
      allowedPgWorkspaceIds: [],
      deadline: sevenDays,
      status: 'draft',
      createdBy: buyerUserId,
      sentAt: null,
    },
    // 사전 제안 RFP — bizProfileId NULL. PG가 일반 등급 가정으로 9개 카드사 입력.
    {
      id: 'P-2605-0002',
      buyerWsId,
      bizProfileId: null,
      title: '사전 제안 (법인 설립 전)',
      memo: '월 예상 매출 5천만원 규모, 일반 등급 가정 제안 부탁드립니다.',
      allowedPgWorkspaceIds: [tossWsId],
      deadline: sevenDays,
      status: 'sent',
      createdBy: buyerUserId,
      sentAt,
    },
  ]);

  // 8. Invitations for the sent RFP. toss/inicis are accepted (PG admin
  // claimed token + submitted bid); kakao stays pending (still 'sent').
  const tossInviteId = randomUUID();
  const inicisInviteId = randomUUID();
  const kakaoInviteId = randomUUID();

  // Raw tokens are seed-only — discarded after hashing.
  await db.insert(rfpInvitations).values([
    {
      id: tossInviteId,
      rfpId: 'P-2604-0001',
      pgWsId: tossWsId,
      acceptedByUserId: tossUserId,
      tokenHash: hashToken(generateToken()),
      sentAt,
      expiresAt: sevenDays,
      status: 'accepted',
    },
    {
      id: inicisInviteId,
      rfpId: 'P-2604-0001',
      pgWsId: inicisWsId,
      acceptedByUserId: inicisUserId,
      tokenHash: hashToken(generateToken()),
      sentAt,
      expiresAt: sevenDays,
      status: 'accepted',
    },
    {
      id: kakaoInviteId,
      rfpId: 'P-2604-0001',
      pgWsId: kakaoWsId,
      acceptedByUserId: null,
      tokenHash: hashToken(generateToken()),
      sentAt,
      expiresAt: sevenDays,
      status: 'pending',
    },
    // 사전 제안 RFP P-2605-0002 — toss 만 초대됨. accepted 상태로 시드.
    {
      id: randomUUID(),
      rfpId: 'P-2605-0002',
      pgWsId: tossWsId,
      acceptedByUserId: tossUserId,
      tokenHash: hashToken(generateToken()),
      sentAt,
      expiresAt: sevenDays,
      status: 'accepted',
    },
  ]);

  // 9. Optional: bid_proposal attachment for the toss bid on P-2604-0001.
  // Inserted before bids so the bid row can carry the FK in a single shot.
  let tossProposalAttachmentId: string | null = null;
  let attachmentCount = 0;
  if (options.withAttachment) {
    tossProposalAttachmentId = randomUUID();
    const storageKey = `2026/05/${tossProposalAttachmentId}.pdf`;
    const fullPath = path.join(uploadDirAbs(), storageKey);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, MINIMAL_PDF as unknown as Uint8Array);

    await db.insert(attachments).values({
      id: tossProposalAttachmentId,
      ownerKind: 'bid_proposal',
      ownerId: 'P-2604-0001',
      name: '제안서_토스.pdf',
      size: MINIMAL_PDF.length,
      mimeType: 'application/pdf',
      storagePath: storageKey,
      uploadedBy: tossUserId,
    });
    attachmentCount = 1;
  }

  // 10. Bids — toss/inicis submitted, kakao did not bid.
  // sme2 grade ⇒ card fees are statutory; cardFeesByIssuer is omitted.
  await db.insert(bids).values([
    {
      id: randomUUID(),
      rfpId: 'P-2604-0001',
      pgWsId: tossWsId,
      invitationId: tossInviteId,
      settleCycle: 'D+1',
      deposit: '0',
      setupFee: '0',
      monthlyMin: '50000',
      bankTransferFeePct: '0.500',
      easyPayFeePct: '2.500',
      cardFeesByIssuer: null,
      overseasCardFeePct: '3.500',
      proposalAttachmentId: tossProposalAttachmentId,
      memo: '월 결제액 1억 기준 D+1 정산',
      status: 'submitted',
      submittedBy: tossUserId,
      submittedAt: now,
    },
    {
      id: randomUUID(),
      rfpId: 'P-2604-0001',
      pgWsId: inicisWsId,
      invitationId: inicisInviteId,
      settleCycle: 'D+2',
      deposit: '0',
      setupFee: '100000',
      monthlyMin: '30000',
      bankTransferFeePct: '0.450',
      easyPayFeePct: '2.700',
      cardFeesByIssuer: null,
      overseasCardFeePct: '3.300',
      proposalAttachmentId: null,
      memo: '셋업비 있으나 월 최저 낮음',
      status: 'submitted',
      submittedBy: inicisUserId,
      submittedAt: now,
    },
  ]);

  return {
    workspaces: 4,
    users: 4,
    members: 4,
    bizProfiles: 2,
    rfps: 3,
    invitations: 4,
    bids: 2,
    contracts: 0,
    notifications: 0,
    outbox: 0,
    attachments: attachmentCount,
    verificationTokens: 0,
    rfpCounters: 2,
    loginCredentials: [
      { email: buyerEmail, password: PASSWORD_PLAINTEXT },
      { email: tossEmail, password: PASSWORD_PLAINTEXT },
      { email: inicisEmail, password: PASSWORD_PLAINTEXT },
      { email: kakaoEmail, password: PASSWORD_PLAINTEXT },
    ],
  };
}

// Direct CLI invocation: `tsx scripts/seed.ts` against $DATABASE_URL.
// ESM-safe entry detection — no require.main equivalent in this runtime.
async function main() {
  const { db } = await import('@/lib/db/client');
  const result = await runSeed(db);

  console.log('— SEED COMPLETE —');
  console.log(`workspaces           : ${result.workspaces}`);
  console.log(`users                : ${result.users}`);
  console.log(`workspace_members    : ${result.members}`);
  console.log(`biz_profiles         : ${result.bizProfiles}`);
  console.log(`rfps                 : ${result.rfps}`);
  console.log(`rfp_invitations      : ${result.invitations}`);
  console.log(`bids                 : ${result.bids}`);
  console.log(`contracts            : ${result.contracts}`);
  console.log(`notifications        : ${result.notifications}`);
  console.log(`outbox_entries       : ${result.outbox}`);
  console.log(`attachments          : ${result.attachments}`);
  console.log(`verification_tokens  : ${result.verificationTokens}`);
  console.log(`rfp_counters         : ${result.rfpCounters}`);
  console.log('');
  console.log('— LOGIN CREDENTIALS (dev only) —');
  for (const c of result.loginCredentials) {
    console.log(`${c.email.padEnd(34)} ${c.password}`);
  }

  // postgres-js holds an open pool — exit explicitly.
  process.exit(0);
}

// Detect direct invocation. `pathToFileURL` handles relative argv (when tsx
// is invoked from another cwd) so the URL compare is reliable.
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
