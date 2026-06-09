// PG_RFP_SPEC.md §6 시나리오 A — buyer 구매사 RFP 발송 (action-only e2e).
//
// Auth.js JWT/cookies 없이 buyer가 워크스페이스를 만든 다음 RFP 를 작성-발송
// 하는 흐름을 액션만으로 재현. P6 가입 → workspace bizProfile 캡처 →
// createRfpAction(send=true) → invitations N + outbox 1+N 검증.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: () => Promise.resolve({ get: () => null }) }));
import { eq } from 'drizzle-orm';

import {
  bizProfiles,
  outboxEntries,
  phoneOtps,
  rfpInvitations,
  rfps,
  workspaceMembers,
  workspaces,
  users,
} from '@/lib/db/schema';
import { hashOtpCode } from '@/lib/server/actions/auth/phoneOtpUtils';
import {
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { setupRfpActionEnv, teardownRfpActionEnv } from '../_setup';
import { signupCompleteAction } from '@/lib/server/actions/auth/signupCompleteAction';
import { signupEmailAction } from '@/lib/server/actions/auth/signupEmailAction';
import { verifyEmailAction } from '@/lib/server/actions/auth/verifyEmailAction';
import type { PgliteDB } from '@/lib/db/client-pglite';

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

import { createRfpAction } from '../../createRfpAction';

let db: PgliteDB;

function tokenFromOutbox(html: string): string {
  return decodeURIComponent(html.match(/token=([^"]+)"/)?.[1] ?? '');
}

describe('scenario A — buyer signs up, captures bizProfile, creates+sends RFP', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('end-to-end: P2→P4→P6 buyer signup → createRfp(send=true) → invitations N + outbox N', async () => {
    // Pre-seed 3 PG workspaces with admin members so outbox entries are generated
    const pg1 = await seedPgWorkspace(db, '서포터 B 페이');
    const pg1Admin = await seedUser(db, { email: 'sales@toss.im' });
    await seedMembership(db, pg1.id, pg1Admin.id, 'admin');

    const pg2 = await seedPgWorkspace(db, 'KG이니시스');
    const pg2Admin = await seedUser(db, { email: 'biz@inicis.com' });
    await seedMembership(db, pg2.id, pg2Admin.id, 'admin');

    const pg3 = await seedPgWorkspace(db, '나이스페이');
    const pg3Admin = await seedUser(db, { email: 'partner@nicepay.co.kr' });
    await seedMembership(db, pg3.id, pg3Admin.id, 'admin');

    const pgWsIds = [pg1.id, pg2.id, pg3.id];
    const adminEntries = [
      { wsId: pg1.id, userId: pg1Admin.id },
      { wsId: pg2.id, userId: pg2Admin.id },
      { wsId: pg3.id, userId: pg3Admin.id },
    ];

    // P2 — request verify email
    const p2 = await signupEmailAction({ email: 'kim@example.com' });
    expect(p2.ok).toBe(true);

    // Pull raw token from the outbox HTML body.
    const verifyOutbox = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'auth.verify'))
      .limit(1);
    const verifyToken = tokenFromOutbox(verifyOutbox[0].html);

    // P4 — consume token
    const p4 = await verifyEmailAction(verifyToken);
    expect(p4.ok).toBe(true);
    if (!p4.ok) return;

    // P6 — finish signup as buyer with bizProfile capture
    const [otpRow] = await db.insert(phoneOtps).values({
      phone: '01033333001',
      codeHash: hashOtpCode('000000'),
      expiresAt: new Date(Date.now() + 5 * 60_000),
      verifiedAt: new Date(),
    }).returning();
    const p6 = await signupCompleteAction({
      email: p4.email,
      name: '김구매',
      password: 'Password123!',
      phone: '01033333001',
      phoneVerificationId: otpRow.id,
      wsKind: 'buyer',
      wsName: '(주)샘플테크',
      bizProfile: {
        bizNo: '1248100998', // 삼성전자: 체크섬 유효
        taxType: 'general',
        status: 'active',
      },
    });
    expect(p6.ok).toBe(true);
    if (!p6.ok) return;
    expect(p6.redirectTo).toBe('/rfp');

    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'kim@example.com'));
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.name, '(주)샘플테크'));
    expect(ws.bizProfileId).not.toBeNull();
    const wsBizBefore = ws.bizProfileId!;
    const [member] = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, ws.id));
    expect(member.userId).toBe(u.id);

    // ── Now act as the signed-in buyer ────────────────────────────
    sessionRef.value = {
      user: {
        id: u.id,
        email: u.email,
        workspaceId: ws.id,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };

    const created = await createRfpAction({
      title: '2026 결제 인프라 제안',
      memo: 'D+1 정산 희망. RFP 첨부.',
      deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      allowedPgWorkspaceIds: pgWsIds,
      requiredPaymentMethods: ['card', 'bank_transfer'],
      send: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Assertion 1: RFP row exists, status='sent', biz_profile_id is a NEW
    // snapshot — distinct from workspace.biz_profile_id (advisor pin 1).
    const [row] = await db
      .select()
      .from(rfps)
      .where(eq(rfps.code, created.rfpId));
    expect(row.status).toBe('sent');
    expect(row.sentAt).not.toBeNull();
    expect(row.bizProfileId).not.toBe(wsBizBefore);

    // The snapshot is its own row; the workspace's pre-action biz row is
    // still present (immutable).
    const allBiz = await db.select().from(bizProfiles);
    expect(allBiz.map((b) => b.id)).toEqual(
      expect.arrayContaining([wsBizBefore, row.bizProfileId]),
    );

    // 🚨 advisor pin 1 — workspace.biz_profile_id MUST equal pre-action value.
    const [wsAfter] = await db
      .select({ id: workspaces.bizProfileId })
      .from(workspaces)
      .where(eq(workspaces.id, ws.id));
    expect(wsAfter.id).toBe(wsBizBefore);

    // Assertion 2: invitations N — token_hash present, pgWsId set, accepted_by null.
    const invs = await db
      .select()
      .from(rfpInvitations)
      .where(eq(rfpInvitations.rfpId, row.id));
    expect(invs).toHaveLength(pgWsIds.length);
    expect(invs.map((i) => i.pgWsId).sort()).toEqual([...pgWsIds].sort());
    for (const inv of invs) {
      expect(inv.tokenHash).toBeTruthy();
      expect(inv.acceptedByUserId).toBeNull();
      expect(inv.status).toBe('pending');
    }

    // Assertion 3: outbox — N invite rows (1 per admin).
    const inviteRows = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'rfp.invited'));
    expect(inviteRows).toHaveLength(pgWsIds.length);
    const expectedKeys = adminEntries
      .map(({ wsId, userId }) => `rfp:${row.id}:invite:ws:${wsId}:user:${userId}`)
      .sort();
    expect(inviteRows.map((r) => r.dedupeKey).sort()).toEqual(expectedKeys);
  });
});
