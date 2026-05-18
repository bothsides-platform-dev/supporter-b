// PG_RFP_SPEC.md §6 시나리오 B — PG 영업담당 입찰 (action-only e2e).
//
// PG signup → buyer signup → createRfp(send=true, pgWsId) → PG claim invite →
// submitBid → buyer 알림 row + outbox row 검증.
//
// 새 모델: PG 워크스페이스가 먼저 존재해야 buyer가 초대할 수 있다.
// PG signups → PG workspace 생성 → buyer가 workspace ID로 RFP 발송.
//
// 인증 모킹: requireSession/requireBuyerSession/requirePgSession 모두 sessionRef.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';

import {
  bids,
  notifications,
  outboxEntries,
  rfpInvitations,
  workspaces,
  workspaceMembers,
  users,
} from '@/lib/db/schema';
import { setupRfpActionEnv, teardownRfpActionEnv } from '../../../rfp/__tests__/_setup';
import { signupCompleteAction } from '@/lib/server/actions/auth/signupCompleteAction';
import { signupEmailAction } from '@/lib/server/actions/auth/signupEmailAction';
import { verifyEmailAction } from '@/lib/server/actions/auth/verifyEmailAction';
import type { PgliteDB } from '@/lib/db/client-pglite';

type SessionUser = {
  id: string;
  email: string;
  name?: string;
  workspaceId: string;
  workspaceType: 'buyer' | 'pg';
  role: 'admin' | 'member';
};

const sessionRef: { value: { user: SessionUser } | null } = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('UNAUTHENTICATED'));
    return Promise.resolve(sessionRef.value);
  },
  requireBuyerSession: () => {
    if (!sessionRef.value || sessionRef.value.user.workspaceType !== 'buyer')
      return Promise.reject(new Error('FORBIDDEN_BUYER'));
    return Promise.resolve(sessionRef.value);
  },
  requirePgSession: () => {
    if (!sessionRef.value || sessionRef.value.user.workspaceType !== 'pg')
      return Promise.reject(new Error('FORBIDDEN_PG'));
    return Promise.resolve(sessionRef.value);
  },
}));

import { createRfpAction } from '../../../rfp/createRfpAction';
import { claimInviteTokenAction } from '../../../invitation/claimInviteTokenAction';
import { submitBidAction } from '../../submitBidAction';

let db: PgliteDB;

function tokenFromInviteUrl(html: string): string {
  // createRfpAction outbox HTML 형식: <a href="${baseUrl}/invite/rfp/${rawToken}">…
  const m = html.match(/\/invite\/rfp\/([^"]+)"/);
  return m?.[1] ?? '';
}

async function pgSignup(email: string): Promise<{ id: string; email: string; wsId: string }> {
  const p2 = await signupEmailAction({ email });
  expect(p2.ok).toBe(true);

  const verifyOutbox = await db
    .select({ html: outboxEntries.html, toAddr: outboxEntries.toAddr })
    .from(outboxEntries)
    .where(
      and(
        eq(outboxEntries.event, 'auth.verify'),
        eq(outboxEntries.toAddr, email),
      ),
    )
    .limit(1);
  const verifyToken = decodeURIComponent(
    verifyOutbox[0].html.match(/token=([^"]+)"/)?.[1] ?? '',
  );
  const p4 = await verifyEmailAction(verifyToken);
  expect(p4.ok).toBe(true);
  if (!p4.ok) throw new Error('verify failed');

  // PG signup — wsKind='pg' creates a new PG workspace with the given name.
  const wsName = `${email.split('@')[1]} 워크스페이스`;
  const p6 = await signupCompleteAction({
    email: p4.email,
    name: '박판매',
    password: 'Password123!',
    wsKind: 'pg',
    wsName,
  });
  expect(p6.ok).toBe(true);

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.name, wsName));
  return { id: u.id, email: u.email, wsId: ws.id };
}

async function buyerSignupAndCreateRfp(pgWsId: string): Promise<{
  buyerUserId: string;
  buyerEmail: string;
  buyerWsId: string;
  rfpId: string;
  pgInviteToken: string;
}> {
  // P2 — buyer email
  const p2 = await signupEmailAction({ email: 'kim@example.com' });
  expect(p2.ok).toBe(true);

  const verifyOutbox = await db
    .select({ html: outboxEntries.html })
    .from(outboxEntries)
    .where(
      and(
        eq(outboxEntries.event, 'auth.verify'),
        eq(outboxEntries.toAddr, 'kim@example.com'),
      ),
    )
    .limit(1);
  const verifyToken = decodeURIComponent(
    verifyOutbox[0].html.match(/token=([^"]+)"/)?.[1] ?? '',
  );

  const p4 = await verifyEmailAction(verifyToken);
  expect(p4.ok).toBe(true);
  if (!p4.ok) throw new Error('verify failed');

  const p6 = await signupCompleteAction({
    email: p4.email,
    name: '김구매',
    password: 'Password123!',
    wsKind: 'buyer',
    wsName: '(주)샘플테크',
    bizProfile: {
      bizNo: '1234567890',
      taxType: 'general',
      status: 'active',
      grade: 'sme2',
      gradeSource: 'user_confirmed',
    },
  });
  expect(p6.ok).toBe(true);

  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'kim@example.com'));
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, '(주)샘플테크'));

  // Buyer creates+sends RFP targeting the PG workspace that already exists.
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
    title: 'PG 제안',
    memo: '',
    deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    allowedPgWorkspaceIds: [pgWsId],
    send: true,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('createRfp failed');

  // Pull invite raw token from outbox HTML (PG admin gets the email).
  const [inviteRow] = await db
    .select({ html: outboxEntries.html })
    .from(outboxEntries)
    .where(eq(outboxEntries.event, 'rfp.invited'))
    .limit(1);
  const pgInviteToken = tokenFromInviteUrl(inviteRow.html);
  expect(pgInviteToken).toBeTruthy();

  return {
    buyerUserId: u.id,
    buyerEmail: u.email,
    buyerWsId: ws.id,
    rfpId: created.rfpId,
    pgInviteToken,
  };
}

describe('scenario B — PG signup → claim invite → submitBid → buyer notified', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('end-to-end: buyer creates RFP → PG claims & submits → buyer ws gets in_app + outbox row', async () => {
    // 1. PG signs up first (workspace must exist before buyer can invite)
    const pgUser = await pgSignup('sales@toss.im');

    // 2. Buyer signs up and creates+sends RFP targeting the PG workspace
    const setup = await buyerSignupAndCreateRfp(pgUser.wsId);

    // 3. PG user claims invite (workspaceId already known from signup)
    sessionRef.value = {
      user: {
        id: pgUser.id,
        email: pgUser.email,
        workspaceId: pgUser.wsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    const claim = await claimInviteTokenAction(setup.pgInviteToken);
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    expect(claim.rfpId).toBe(setup.rfpId);

    // Workspace + membership exist from PG signup.
    const [pgWs] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, pgUser.wsId));
    expect(pgWs).toBeDefined();
    expect(pgWs.type).toBe('pg');

    const [m] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, pgUser.wsId),
          eq(workspaceMembers.userId, pgUser.id),
        ),
      );
    expect(m).toBeDefined();
    expect(m.role).toBe('admin');

    // 4. PG submits a bid.
    const bid = await submitBidAction({
      rfpId: setup.rfpId,
      settleCycle: 'D+1',
      deposit: 1_000_000,
      setupFee: 500_000,
      monthlyMin: 100_000,
      bankTransferFeePct: 0.001,
      easyPayFeePct: 0.018,
      // sme2 RFP → 서버에서 cardFees null로 강제. 클라이언트 입력은 무시되어야.
      cardFeesByIssuer: {
        BC: 0.005,
        SHINHAN: 0.005,
        SAMSUNG: 0.005,
        HYUNDAI: 0.005,
        KB: 0.005,
        LOTTE: 0.005,
        NH: 0.005,
        HANA: 0.005,
        WOORI: 0.005,
      },
      memo: 'D+1 정산 가능',
    });
    expect(bid.ok).toBe(true);
    if (!bid.ok) return;

    // 🚨 Assertion 1 — bids row exists with grade-enforced cardFees=null
    //   (advisor pin 1: STATUTORY_CARD_FEE 강제).
    const [bidRow] = await db.select().from(bids).where(eq(bids.id, bid.bidId));
    expect(bidRow.status).toBe('submitted');
    expect(bidRow.pgWsId).toBe(pgUser.wsId);
    expect(bidRow.cardFeesByIssuer).toBeNull();

    // — invitation now accepted with this user.
    const [inv] = await db
      .select()
      .from(rfpInvitations)
      .where(eq(rfpInvitations.rfpId, setup.rfpId));
    expect(inv.acceptedByUserId).toBe(pgUser.id);
    expect(inv.status).toBe('accepted');

    // Assertion 2 — buyer ws notification row (in_app, type='bid.submitted')
    //   for each buyer member (here 1 member: 김구매).
    const notifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, setup.buyerWsId),
          eq(notifications.type, 'bid.submitted'),
        ),
      );
    expect(notifs).toHaveLength(1);
    expect(notifs[0].userId).toBe(setup.buyerUserId);
    expect(notifs[0].channel).toBe('in_app');

    // Assertion 3 — outbox row(bid.submitted) for the buyer with member-keyed
    //   dedupe `bid:{rfpId}:{pgWsId}:{userId}`.
    const submittedOutbox = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'bid.submitted'));
    expect(submittedOutbox).toHaveLength(1);
    expect(submittedOutbox[0].toAddr).toBe(setup.buyerEmail);
    expect(submittedOutbox[0].dedupeKey).toBe(
      `bid:${setup.rfpId}:${pgUser.wsId}:${setup.buyerUserId}`,
    );
  });
});
