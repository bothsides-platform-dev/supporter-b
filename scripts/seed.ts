/**
 * scripts/seed.ts — idempotent dev/test seed.
 *
 * Run via `pnpm db:seed` (= `tsx scripts/seed.ts`) against the local Docker
 * Postgres. Also imported by `scripts/__tests__/seed.test.ts` which passes a
 * pglite handle to `runSeed(db)` for fast in-process verification.
 *
 * Strategy: TRUNCATE all 14 tables CASCADE RESTART IDENTITY in one statement
 * (FK order resolved by CASCADE), then bulk INSERT. Re-running drops and
 * recreates everything — safe to call repeatedly during development.
 *
 * NOTE on credentials: `password123` is **dev-only**. Production seeding
 * never runs this script; passwords are hashed with bcrypt cost=12 via the
 * shared `lib/auth/password.ts` helper.
 */
import 'dotenv/config';

import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import {
  bids,
  bizProfiles,
  columns,
  rfpAllowedPg,
  rfpCounters,
  rfpInvitations,
  rfps,
  users,
  workspaceMembers,
  workspaces,
} from '@/lib/db/schema';
import { defaultColumns } from '@/lib/server/columns/seed';
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

export async function runSeed(db: AnyDb): Promise<SeedResult> {
  // 1. TRUNCATE everything in one CASCADE — FK order doesn't matter.
  // RESTART IDENTITY also covers the rfp_counters integer (though the table
  // has no serial). All 14 tables explicitly listed for grep visibility.
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
      columns,
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
  const tossEmail = 'ws-toss-admin@example.com';
  const inicisEmail = 'ws-inicis-admin@example.com';
  const kakaoEmail = 'ws-kakao-admin@example.com';

  // emailVerified: true — these are already-onboarded fixtures. The schema
  // defaults users to emailVerified=false, and the (app) shell guard now sends
  // unverified members to /pending-approval regardless of workspace status, so
  // seeded users must be verified or every authed e2e scenario would bounce.
  await db.insert(users).values([
    {
      id: buyerUserId,
      email: buyerEmail,
      passwordHash,
      name: '이성연',
      avatarColor: 'accent',
      emailVerified: true,
    },
    {
      id: tossUserId,
      email: tossEmail,
      passwordHash,
      name: '서포터 B 페이 관리자',
      avatarColor: 'lavender',
      emailVerified: true,
    },
    {
      id: inicisUserId,
      email: inicisEmail,
      passwordHash,
      name: '이니시스 관리자',
      avatarColor: 'moss',
      emailVerified: true,
    },
    {
      id: kakaoUserId,
      email: kakaoEmail,
      passwordHash,
      name: '카카오페이 관리자',
      avatarColor: 'amber',
      emailVerified: true,
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

  // status: 'active' — the schema defaults workspaces to 'pending', and the
  // (app) shell gate redirects pending/suspended workspaces to /pending-approval
  // (lib/auth/shell-access.ts). Without this, every seeded user bounces off
  // /home and the whole app (incl. all e2e scenarios) is unreachable.
  await db.insert(workspaces).values([
    {
      id: buyerWsId,
      type: 'buyer',
      name: '(주)샘플테크',
      bizProfileId: buyerBizId,
      status: 'active',
    },
    {
      id: tossWsId,
      type: 'pg',
      name: '서포터 B 페이',
      status: 'active',
    },
    {
      id: inicisWsId,
      type: 'pg',
      name: 'KG이니시스',
      status: 'active',
    },
    {
      id: kakaoWsId,
      type: 'pg',
      name: '카카오페이',
      status: 'active',
    },
  ]);

  // 5b. Unified kanban columns — buyer and PG both get the pipeline board
  //     (same source as createWorkspaceInTx).
  await db.insert(columns).values([
    ...defaultColumns(buyerWsId, 'buyer'),
    ...defaultColumns(tossWsId, 'pg'),
    ...defaultColumns(inicisWsId, 'pg'),
    ...defaultColumns(kakaoWsId, 'pg'),
  ]);

  // 6. Memberships — each user is admin of their own workspace. The buyer admin
  //    is ALSO a member of the 서포터 B 페이 PG workspace, demonstrating one user
  //    across workspaces of different types (the multi-workspace switcher).
  await db.insert(workspaceMembers).values([
    { workspaceId: buyerWsId, userId: buyerUserId, role: 'admin' },
    { workspaceId: tossWsId, userId: tossUserId, role: 'admin' },
    { workspaceId: inicisWsId, userId: inicisUserId, role: 'admin' },
    { workspaceId: kakaoWsId, userId: kakaoUserId, role: 'admin' },
    // cross-type second membership for the buyer admin.
    { workspaceId: tossWsId, userId: buyerUserId, role: 'member' },
  ]);

  // 6b. Remembered active workspace per user (FK requires workspaces to exist,
  //     so this runs after the inserts above). Each lands in their primary ws;
  //     the buyer admin lands in the buyer ws and can switch to 서포터 B 페이.
  await db
    .update(users)
    .set({ lastActiveWorkspaceId: buyerWsId })
    .where(eq(users.id, buyerUserId));
  await db
    .update(users)
    .set({ lastActiveWorkspaceId: tossWsId })
    .where(eq(users.id, tossUserId));
  await db
    .update(users)
    .set({ lastActiveWorkspaceId: inicisWsId })
    .where(eq(users.id, inicisUserId));
  await db
    .update(users)
    .set({ lastActiveWorkspaceId: kakaoWsId })
    .where(eq(users.id, kakaoUserId));

  // 7. RFPs — counters first so the FK / numbering is consistent on direct
  // inserts (we bypass nextRfpId() because it derives YYMM from `now()`).
  await db.insert(rfpCounters).values([
    { yearMonth: '2604', lastSeq: 1 },
    { yearMonth: '2605', lastSeq: 2 },
  ]);

  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 3_600_000);
  const sentAt = new Date(now.getTime() - 24 * 3_600_000); // sent yesterday

  // uuid 서로게이트 id + 사람용 code (P-YYMM-NNNN).
  const rfpAprId = randomUUID();
  const rfpMayDraftId = randomUUID();
  const rfpMayPresaleId = randomUUID();

  await db.insert(rfps).values([
    {
      id: rfpAprId,
      code: 'P-2604-0001',
      buyerWsId,
      bizProfileId: rfpSnapshotBizId,
      title: '2026년 4월 PG 입찰',
      memo: '월 매출 1억 규모, 카드 + 간편결제 위주',
      deadline: sevenDays,
      status: 'sent',
      createdBy: buyerUserId,
      sentAt,
    },
    {
      id: rfpMayDraftId,
      code: 'P-2605-0001',
      buyerWsId,
      bizProfileId: rfpSnapshotBizId,
      title: '2026년 5월 PG 입찰 (초안)',
      memo: '',
      deadline: sevenDays,
      status: 'draft',
      createdBy: buyerUserId,
      sentAt: null,
    },
    // 사전 제안 RFP — bizProfileId NULL. PG가 일반 등급 가정으로 9개 카드사 입력.
    {
      id: rfpMayPresaleId,
      code: 'P-2605-0002',
      buyerWsId,
      bizProfileId: null,
      title: '사전 제안 (법인 설립 전)',
      memo: '월 예상 매출 5천만원 규모, 일반 등급 가정 제안 부탁드립니다.',
      deadline: sevenDays,
      status: 'sent',
      createdBy: buyerUserId,
      sentAt,
    },
  ]);

  // allowlist → rfp_allowed_pg 조인 테이블 (C2).
  await db.insert(rfpAllowedPg).values([
    { rfpId: rfpAprId, pgWsId: tossWsId },
    { rfpId: rfpAprId, pgWsId: inicisWsId },
    { rfpId: rfpAprId, pgWsId: kakaoWsId },
    { rfpId: rfpMayPresaleId, pgWsId: tossWsId },
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
      rfpId: rfpAprId,
      pgWsId: tossWsId,
      acceptedByUserId: tossUserId,
      tokenHash: hashToken(generateToken()),
      sentAt,
      expiresAt: sevenDays,
      status: 'accepted',
    },
    {
      id: inicisInviteId,
      rfpId: rfpAprId,
      pgWsId: inicisWsId,
      acceptedByUserId: inicisUserId,
      tokenHash: hashToken(generateToken()),
      sentAt,
      expiresAt: sevenDays,
      status: 'accepted',
    },
    {
      id: kakaoInviteId,
      rfpId: rfpAprId,
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
      rfpId: rfpMayPresaleId,
      pgWsId: tossWsId,
      acceptedByUserId: tossUserId,
      tokenHash: hashToken(generateToken()),
      sentAt,
      expiresAt: sevenDays,
      status: 'accepted',
    },
  ]);

  // 9. Bids — toss/inicis submitted, kakao did not bid.
  //
  // Note: this seed does **not** create bid_proposal attachments. Specs
  // that need an attached PDF (e.g. e2e/bid-detail-pdf-preview.spec.ts)
  // upload one in their setup via `attachTossProposalPdf` so the bytes
  // land in the Storage backend `getStorage()` returns (a shared
  // filesystem dir in e2e, R2 in prod) — the same backend the route
  // reads from at runtime.
  // sme2 grade ⇒ card fees are statutory; cardFeesByIssuer is omitted.
  await db.insert(bids).values([
    {
      id: randomUUID(),
      rfpId: rfpAprId,
      pgWsId: tossWsId,
      invitationId: tossInviteId,
      settleCycle: 'D+1',
      // 정산한도는 0 초과가 필수다(v0.4.27.0 `isSettleLimitValid`) — 0 을 심으면
      // 위저드로는 만들 수 없는 견적이 로컬에 생기고, 비교 화면이 '한도 0원'을
      // 보여줘 없어진 결함이 살아 있는 것처럼 읽힌다. 메모의 1억 기준에 맞춘다.
      // 보증보험 0 은 필수가 아니라 유효값이므로 그대로 둔다(0원 표시 경로 유지).
      settleLimit: '100000000',
      guaranteeInsurance: '0',
      signupFee: '0',
      paymentFees: {},
      memo: '월 결제액 1억 기준 D+1 정산',
      status: 'submitted',
      submittedBy: tossUserId,
      submittedAt: now,
    },
    {
      id: randomUUID(),
      rfpId: rfpAprId,
      pgWsId: inicisWsId,
      invitationId: inicisInviteId,
      settleCycle: 'D+2',
      settleLimit: '80000000',
      guaranteeInsurance: '0',
      signupFee: '500000',
      paymentFees: {},
      memo: '셋업비 있으나 월 최저 낮음',
      status: 'submitted',
      submittedBy: inicisUserId,
      submittedAt: now,
    },
  ]);

  return {
    workspaces: 4,
    users: 4,
    members: 5,
    bizProfiles: 2,
    rfps: 3,
    invitations: 4,
    bids: 2,
    contracts: 0,
    notifications: 0,
    outbox: 0,
    attachments: 0,
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
