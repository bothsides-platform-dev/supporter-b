/**
 * scripts/perf-seed.ts — 성능 테스트 전용 시드
 *
 * 고정 UUID를 사용해 k6 스크립트에서 ID를 사전에 알 수 있다.
 * 실행: pnpm perf:seed
 *
 * 출력 (stdout JSON):
 * { buyerEmail, buyerPassword, pgEmails, pgPassword, rfpIds, buyerWsId, pgWsIds }
 */
import 'dotenv/config';

import { inArray } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';

import {
  columns,
  rfpAllowedPg,
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

const BUYER_USER_ID = 'beef0000-0000-0000-0000-000000000001';
const BUYER_WS_ID   = 'beef0000-0000-0000-0000-000000000010';

const PG_COUNT = 10;
const pgUserIds = Array.from({ length: PG_COUNT }, (_, i) =>
  `beef0000-0000-0000-0001-${String(i + 1).padStart(12, '0')}`,
);
const pgWsIds = Array.from({ length: PG_COUNT }, (_, i) =>
  `beef0000-0000-0000-0002-${String(i + 1).padStart(12, '0')}`,
);
const rfpIds = Array.from({ length: PG_COUNT }, (_, i) =>
  `beef0000-0000-0000-0003-${String(i + 1).padStart(12, '0')}`,
);
const invitationIds = Array.from({ length: PG_COUNT }, (_, i) =>
  `beef0000-0000-0000-0004-${String(i + 1).padStart(12, '0')}`,
);

const BUYER_EMAIL    = 'perf-buyer@supporter-b.test';
const BUYER_PASSWORD = 'perf-password-123';
const PG_PASSWORD    = 'perf-password-123';
const pgEmails       = Array.from({ length: PG_COUNT }, (_, i) => `perf-pg-${i + 1}@supporter-b.test`);

export async function runPerfSeed(db: DB) {
  const now      = new Date();
  const deadline = new Date(now.getTime() + 7 * 24 * 3_600_000);

  const allWsIds   = [BUYER_WS_ID, ...pgWsIds];
  const allUserIds = [BUYER_USER_ID, ...pgUserIds];

  await db.delete(rfpInvitations).where(inArray(rfpInvitations.id, invitationIds));
  await db.delete(rfpAllowedPg).where(inArray(rfpAllowedPg.rfpId, rfpIds));
  await db.delete(rfps).where(inArray(rfps.id, rfpIds));
  await db.delete(columns).where(inArray(columns.workspaceId, allWsIds));
  await db.delete(workspaceMembers).where(inArray(workspaceMembers.workspaceId, allWsIds));
  await db.delete(workspaces).where(inArray(workspaces.id, allWsIds));
  await db.delete(users).where(inArray(users.id, allUserIds));

  const passwordHash = await hashPassword(BUYER_PASSWORD);

  // 1. 구매사
  await db.insert(users).values({
    id: BUYER_USER_ID, email: BUYER_EMAIL, passwordHash,
    name: '퍼프테스트 구매사', emailVerified: true, emailVerifiedAt: now,
  });
  await db.insert(workspaces).values({
    id: BUYER_WS_ID, name: '퍼프테스트 구매사 워크스페이스',
    type: 'buyer', status: 'active',
  });
  await db.insert(workspaceMembers).values({ workspaceId: BUYER_WS_ID, userId: BUYER_USER_ID, role: 'admin' });
  await db.insert(columns).values(defaultColumns(BUYER_WS_ID, 'buyer'));

  // 2. PG 10개
  await db.insert(users).values(
    pgUserIds.map((id, i) => ({
      id, email: pgEmails[i], passwordHash,
      name: `퍼프테스트 PG ${i + 1}`, emailVerified: true, emailVerifiedAt: now,
    })),
  );
  await db.insert(workspaces).values(
    pgWsIds.map((id, i) => ({
      id, name: `퍼프테스트 PG 워크스페이스 ${i + 1}`, type: 'pg' as const, status: 'active' as const,
    })),
  );
  await db.insert(workspaceMembers).values(
    pgWsIds.map((workspaceId, i) => ({ workspaceId, userId: pgUserIds[i], role: 'admin' as const })),
  );
  for (const pgWsId of pgWsIds) {
    await db.insert(columns).values(defaultColumns(pgWsId, 'pg'));
  }

  // 3. RFP 10개 (PG별 1개)
  await db.insert(rfps).values(
    rfpIds.map((id, i) => ({
      id,
      code:      `P-PERF-${String(i + 1).padStart(4, '0')}`,
      buyerWsId: BUYER_WS_ID,
      title:     `퍼프테스트 RFP ${i + 1}`,
      deadline,
      status:    'sent' as const,
      createdBy: BUYER_USER_ID,
      sentAt:    now,
      boardVisible: false,
    })),
  );

  // 4. allowlist
  await db.insert(rfpAllowedPg).values(
    rfpIds.map((rfpId, i) => ({ rfpId, pgWsId: pgWsIds[i] })),
  );

  // 5. invitations (accepted — 인박스 즉시 노출)
  await db.insert(rfpInvitations).values(
    rfpIds.map((rfpId, i) => ({
      id:               invitationIds[i],
      rfpId,
      pgWsId:           pgWsIds[i],
      acceptedByUserId: pgUserIds[i],
      tokenHash:        hashToken(generateToken()),
      sentAt:           now,
      expiresAt:        deadline,
      status:           'accepted' as const,
    })),
  );

  return { buyerEmail: BUYER_EMAIL, buyerPassword: BUYER_PASSWORD, buyerWsId: BUYER_WS_ID, pgEmails, pgPassword: PG_PASSWORD, pgWsIds, rfpIds, invitationIds };
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();

if (invokedDirectly) {
  async function main() {
    const { db } = await import('@/lib/db/client');
    const result = await runPerfSeed(db);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(0);
  }
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
