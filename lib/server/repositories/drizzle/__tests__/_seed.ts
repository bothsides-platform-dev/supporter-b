// Test seed helpers — keep imports minimal so individual files can compose.
import { randomUUID } from 'node:crypto';
import {
  users,
  workspaces,
  workspaceMembers,
  bizProfiles,
  rfps,
  rfpInvitations,
  bids,
} from '@/lib/db/schema';
import type { PgliteDB } from '@/lib/db/client-pglite';

export async function seedUser(
  db: PgliteDB,
  overrides?: {
    id?: string;
    email?: string;
    name?: string;
    isSystemAccount?: boolean;
    phone?: string;
    // passwordHash '!' = 영구 로그인 불가 데모/온보딩 placeholder(createSystemAccount).
    // master/ops 등 실제 사람 계정은 실 해시(기본 'x')를 갖는다.
    passwordHash?: string;
  },
): Promise<{ id: string; email: string; name: string }> {
  const id = overrides?.id ?? randomUUID();
  const email = overrides?.email ?? `u-${id.slice(0, 8)}@example.com`;
  const name = overrides?.name ?? 'Tester';
  await db.insert(users).values({
    id,
    email,
    passwordHash: overrides?.passwordHash ?? 'x',
    name,
    avatarColor: 'ink',
    ...(overrides?.isSystemAccount ? { isSystemAccount: true } : {}),
    ...(overrides?.phone ? { phone: overrides.phone } : {}),
  });
  return { id, email, name };
}

export async function seedBizProfile(
  db: PgliteDB,
  overrides?: { bizNo?: string },
): Promise<{ id: string; bizNo: string }> {
  const id = randomUUID();
  const bizNo = overrides?.bizNo ?? '1234567890';
  await db.insert(bizProfiles).values({
    id,
    bizNo,
    taxType: 'general',
    status: 'active',
    grade: 'general',
    gradeSource: 'user_confirmed',
  });
  return { id, bizNo };
}

export async function seedBuyerWorkspace(
  db: PgliteDB,
  overrides?: { name?: string; bizProfileId?: string },
): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(workspaces).values({
    id,
    type: 'buyer',
    name: overrides?.name ?? '구매사',
    bizProfileId: overrides?.bizProfileId ?? null,
    status: 'active', // explicit: test seeds are pre-approved workspaces
  });
  return { id };
}

export async function seedPgWorkspace(
  db: PgliteDB,
  name: string,
  overrides?: { name?: string },
): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(workspaces).values({
    id,
    type: 'pg',
    name: overrides?.name ?? name,
    status: 'active', // explicit: test seeds are pre-approved workspaces
  });
  return { id };
}

export async function seedMembership(
  db: PgliteDB,
  workspaceId: string,
  userId: string,
  role: 'admin' | 'member' = 'member',
  overrides?: { joinedAt?: Date; approvalStatus?: 'approved' | 'pending_approval' | 'rejected' },
): Promise<void> {
  await db.insert(workspaceMembers).values({
    workspaceId,
    userId,
    role,
    ...(overrides?.joinedAt ? { joinedAt: overrides.joinedAt } : {}),
    ...(overrides?.approvalStatus ? { approvalStatus: overrides.approvalStatus } : {}),
  });
}

export async function seedRfp(
  db: PgliteDB,
  opts: { buyerWsId: string; createdBy: string; code?: string },
): Promise<{ id: string; code: string }> {
  const id = randomUUID();
  const code = opts.code ?? `P-2605-${Math.floor(1000 + Math.random() * 8999)}`;
  await db.insert(rfps).values({
    id,
    code,
    buyerWsId: opts.buyerWsId,
    title: 'RFP',
    deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    createdBy: opts.createdBy,
  });
  return { id, code };
}

// Minimal accepted invitation — satisfies bids.invitationId FK (bid.test.ts
// inlines the same shape; factored here for contract-doc tests that just need
// a valid (rfp, pg) pair to hang a bid off of).
export async function seedInvitation(
  db: PgliteDB,
  opts: { rfpId: string; pgWsId: string },
): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(rfpInvitations).values({
    id,
    rfpId: opts.rfpId,
    pgWsId: opts.pgWsId,
    tokenHash: randomUUID(), // placeholder — hash contents unused by these tests
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    status: 'accepted',
  });
  return { id };
}

export async function seedBid(
  db: PgliteDB,
  opts: { rfpId: string; pgWsId: string; invitationId: string; submittedBy: string },
): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(bids).values({
    id,
    rfpId: opts.rfpId,
    pgWsId: opts.pgWsId,
    invitationId: opts.invitationId,
    settleCycle: 'D+1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    paymentFees: {},
    submittedBy: opts.submittedBy,
  });
  return { id };
}
