import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
  bizProfiles,
  outboxEntries,
  pgProfiles,
  phoneOtps,
  users,
  verificationTokens,
  workspaceMembers,
  workspaces,
} from '@/lib/db/schema';
import { getWorkspaceAdminUser } from '@/lib/server/queries/admin/workspaceOwner';
import { hashOtpCode } from '../phoneOtpUtils';
import { signupEmailAction } from '../signupEmailAction';
import { signupCompleteAction } from '../signupCompleteAction';
import { verifyEmailAction } from '../verifyEmailAction';
import { setupActionEnv, teardownActionEnv } from './_setup';
import { __setActionDbForTest } from '../_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';

const DEFAULT_PHONE = '01099999999';
// Fixed UUID used by throwingInsertDb so VALID_SIGNUP can be a static constant.
const FAKE_OTP_ID = randomUUID();

// Fake action-db for error-tightening tests. Stubs the phoneOtps select so the
// phone pre-check passes, then throws from the user INSERT inside the transaction.
function throwingInsertDb(error: unknown) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => [{ id: FAKE_OTP_ID, phone: DEFAULT_PHONE, verifiedAt: new Date() }],
        }),
      }),
    }),
    transaction: async (cb: (tx: unknown) => unknown) =>
      cb({ insert: () => ({ values: () => { throw error; } }) }),
  };
}

const VALID_SIGNUP = {
  email: 'tighten@example.com',
  name: '테스터',
  password: 'Password123!',
  phone: DEFAULT_PHONE,
  phoneVerificationId: FAKE_OTP_ID,
  wsKind: 'buyer' as const,
  wsName: '(주)테스트',
};

let db: PgliteDB;

async function seedVerifiedOtp(phone: string = DEFAULT_PHONE): Promise<string> {
  const [row] = await db
    .insert(phoneOtps)
    .values({
      phone,
      codeHash: hashOtpCode('000000'),
      expiresAt: new Date(Date.now() + 5 * 60_000),
      verifiedAt: new Date(),
    })
    .returning();
  return row.id;
}

describe('signupEmailAction + verifyEmailAction', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('issues a token, enqueues the outbox row, and verify consumes it', async () => {
    const r = await signupEmailAction({ email: 'Kim@example.com' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.email).toBe('kim@example.com'); // normalised

    // Verification row + outbox row exist.
    const tokens = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.email, 'kim@example.com'));
    expect(tokens).toHaveLength(1);

    const out = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'kim@example.com'));
    expect(out).toHaveLength(1);
    expect(out[0].event).toBe('auth.verify');
  });

  it('rejects malformed emails', async () => {
    const r = await signupEmailAction({ email: 'not-an-email' });
    expect(r.ok).toBe(false);
  });

  it('verify returns email + inviteToken from meta', async () => {
    const r = await signupEmailAction({
      email: 'sales@toss.im',
      inviteToken: 'INVITE-RAW-1',
    });
    expect(r.ok).toBe(true);

    // Pull the raw token from the outbox HTML body — Step 5 fallback.
    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'sales@toss.im'))
      .limit(1);
    const token = tokenFromHtml(rows[0].html);
    expect(token).not.toEqual('');

    const v = await verifyEmailAction(token);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.email).toBe('sales@toss.im');
    expect(v.inviteToken).toBe('INVITE-RAW-1');
  });

  it('verify rejects an unknown token', async () => {
    const v = await verifyEmailAction('definitely-not-a-real-token');
    expect(v.ok).toBe(false);
  });

  it('verify rejects a reused token (atomic consume)', async () => {
    await signupEmailAction({ email: 'a@example.com' });
    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'a@example.com'))
      .limit(1);
    const token = tokenFromHtml(rows[0].html);
    const first = await verifyEmailAction(token);
    expect(first.ok).toBe(true);
    const second = await verifyEmailAction(token);
    expect(second.ok).toBe(false);
  });

  it('stores workspaceType=buyer in meta and verify returns it', async () => {
    const r = await signupEmailAction({ email: 'buyer@example.com', workspaceType: 'buyer' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'buyer@example.com'))
      .limit(1);
    const token = tokenFromHtml(rows[0].html);

    const v = await verifyEmailAction(token);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.workspaceType).toBe('buyer');
  });

  it('stores workspaceType=pg in meta and verify returns it', async () => {
    const r = await signupEmailAction({ email: 'pg@toss.im', workspaceType: 'pg' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'pg@toss.im'))
      .limit(1);
    const token = tokenFromHtml(rows[0].html);

    const v = await verifyEmailAction(token);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.workspaceType).toBe('pg');
  });

  it('returns EMAIL_TAKEN if user with that email already exists', async () => {
    const vid = await seedVerifiedOtp('01011112222');
    await signupCompleteAction({
      email: 'existing@example.com',
      name: '기존사용자',
      password: 'Password123!',
      phone: '01011112222',
      phoneVerificationId: vid,
      wsKind: 'buyer',
      wsName: '테스트워크스페이스',
    });

    const r = await signupEmailAction({ email: 'existing@example.com' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('EMAIL_TAKEN');
  });
});

function tokenFromHtml(html: string): string {
  return decodeURIComponent(html.match(/token=([^"]+)"/)?.[1] ?? '');
}

describe('signupCompleteAction — buyer branch', () => {
  let verificationId: string;

  beforeEach(async () => {
    db = await setupActionEnv();
    verificationId = await seedVerifiedOtp();
  });
  afterEach(teardownActionEnv);

  it('creates user + biz_profile + workspace + admin member, returns /rfp', async () => {
    const r = await signupCompleteAction({
      email: 'kim@example.com',
      name: '김구매',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'buyer',
      wsName: '(주)샘플테크',
      bizProfile: {
        bizNo: '1234567890',
        taxType: 'general',
        status: 'active',
        grade: 'general',
        gradeSource: 'user_confirmed',
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.redirectTo).toBe('/rfp');
    expect(r.password).toBe('Password123!');

    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'kim@example.com'));
    expect(u).toBeDefined();

    const [biz] = await db
      .select()
      .from(bizProfiles)
      .where(eq(bizProfiles.bizNo, '1234567890'));
    expect(biz).toBeDefined();

    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.name, '(주)샘플테크'));
    expect(ws).toBeDefined();
    expect(ws.type).toBe('buyer');
    expect(ws.bizProfileId).toBe(biz.id);

    const [member] = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, ws.id));
    expect(member.role).toBe('admin');
    expect(member.userId).toBe(u.id);
  });

  it('rejects when wsKind is buyer but wsName missing', async () => {
    const r = await signupCompleteAction({
      email: 'kim@example.com',
      name: '김구매',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'buyer',
    });
    expect(r.ok).toBe(false);
  });

  it('returns EMAIL_TAKEN if a user with the email already exists', async () => {
    const ok = await signupCompleteAction({
      email: 'kim@example.com',
      name: '김구매',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'buyer',
      wsName: 'A',
    });
    expect(ok.ok).toBe(true);
    // Second signup with same email — phone OTP is already verified so reuse is fine.
    const dup = await signupCompleteAction({
      email: 'kim@example.com',
      name: '다른사람',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'buyer',
      wsName: 'B',
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toBe('EMAIL_TAKEN');
  });
});

describe('signupCompleteAction — pg branch', () => {
  let verificationId: string;

  beforeEach(async () => {
    db = await setupActionEnv();
    verificationId = await seedVerifiedOtp();
  });
  afterEach(teardownActionEnv);

  it('creates a new PG workspace with the provided name, returns /inbox', async () => {
    const r = await signupCompleteAction({
      email: 'sales@toss.im',
      name: '서포터 B 페이 영업',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'pg',
      wsName: '서포터 B 페이',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.redirectTo).toBe('/inbox');

    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.name, '서포터 B 페이'));
    expect(ws).toBeDefined();
    expect(ws.type).toBe('pg');

    const [member] = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, ws.id));
    expect(member.role).toBe('admin');
  });

  it('creates the PG profile (serviceScope) and exposes the owner contact (verified phone) via users — no separate sales input', async () => {
    const r = await signupCompleteAction({
      email: 'sales@toss.im',
      name: '서포터 B 페이 영업',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'pg',
      wsName: '서포터 B 페이',
      pgProfile: {
        bizNo: '1112223333',
        serviceScope: {
          paymentMethods: ['카드'],
          industries: [],
          volumeRange: '1억 미만',
          integrationTypes: [],
        },
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.name, '서포터 B 페이'));
    const [profile] = await db
      .select()
      .from(pgProfiles)
      .where(eq(pgProfiles.workspaceId, ws.id));
    expect(profile).toBeDefined();
    expect(profile.serviceScope?.paymentMethods).toEqual(['카드']);

    // The PG contact is the registering user — no duplicated salesContact column.
    // The verified phone lives only on users.phone (digits-only), reachable as
    // the workspace owner.
    const owner = await getWorkspaceAdminUser(ws.id, db);
    expect(owner).toEqual({
      name: '서포터 B 페이 영업',
      email: 'sales@toss.im',
      phone: DEFAULT_PHONE,
    });
  });

  it('rejects when wsKind is pg but wsName missing', async () => {
    const r = await signupCompleteAction({
      email: 'sales@toss.im',
      name: '서포터 B 페이 영업',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'pg',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('MISSING_WS_NAME');
  });

  it('each PG signup creates its own workspace (no auto-join by domain)', async () => {
    const vid2 = await seedVerifiedOtp('01088880001');
    const r1 = await signupCompleteAction({
      email: 'first@toss.im',
      name: '첫번째',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'pg',
      wsName: '서포터 B 페이 1팀',
    });
    const r2 = await signupCompleteAction({
      email: 'second@toss.im',
      name: '두번째',
      password: 'Password123!',
      phone: '01088880001',
      phoneVerificationId: vid2,
      wsKind: 'pg',
      wsName: '서포터 B 페이 2팀',
    });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const wss = await db.select().from(workspaces);
    const pgWss = wss.filter((w) => w.type === 'pg');
    expect(pgWss).toHaveLength(2);
  });
});

describe('signupCompleteAction — password policy (server-side)', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('rejects a 10-char letter-only password with WEAK_PASSWORD', async () => {
    const r = await signupCompleteAction({
      email: 'weak@example.com',
      name: '약한사용자',
      password: 'aaaaaaaaaa',
      phone: DEFAULT_PHONE,
      phoneVerificationId: randomUUID(),
      wsKind: 'buyer',
      wsName: '(주)샘플',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('WEAK_PASSWORD');
  });

  it('rejects a 10-char digit-only password with WEAK_PASSWORD', async () => {
    const r = await signupCompleteAction({
      email: 'weak2@example.com',
      name: '약한사용자',
      password: '1234567890',
      phone: DEFAULT_PHONE,
      phoneVerificationId: randomUUID(),
      wsKind: 'buyer',
      wsName: '(주)샘플',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('WEAK_PASSWORD');
  });

  it('rejects when special character is missing', async () => {
    const r = await signupCompleteAction({
      email: 'weak3@example.com',
      name: '약한사용자',
      password: 'Password123', // letter+digit but no special
      phone: DEFAULT_PHONE,
      phoneVerificationId: randomUUID(),
      wsKind: 'pg',
      wsName: '약한PG',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('WEAK_PASSWORD');
  });

  it('still surfaces INVALID_INPUT for non-password schema failures (bad email)', async () => {
    const r = await signupCompleteAction({
      email: 'not-an-email',
      name: '약한사용자',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: randomUUID(),
      wsKind: 'buyer',
      wsName: '(주)샘플',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });
});

describe('signupCompleteAction — insert error tightening', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('maps a postgres-shaped unique violation (err.code) to EMAIL_TAKEN', async () => {
    __setActionDbForTest(
      throwingInsertDb(Object.assign(new Error('dup'), { code: '23505' })),
    );
    const r = await signupCompleteAction(VALID_SIGNUP);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('EMAIL_TAKEN');
  });

  it('maps a pglite-shaped unique violation (err.cause.code) to EMAIL_TAKEN', async () => {
    __setActionDbForTest(
      throwingInsertDb(Object.assign(new Error('dup'), { cause: { code: '23505' } })),
    );
    const r = await signupCompleteAction(VALID_SIGNUP);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('EMAIL_TAKEN');
  });

  it('rethrows a non-unique DB error instead of masking it as EMAIL_TAKEN', async () => {
    __setActionDbForTest(
      throwingInsertDb(Object.assign(new Error('not null'), { code: '23502' })),
    );
    await expect(signupCompleteAction(VALID_SIGNUP)).rejects.toThrow('not null');
  });
});
