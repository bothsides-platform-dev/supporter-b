import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { signupMockHostRef } = vi.hoisted(() => ({ signupMockHostRef: { value: null as string | null } }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve({ get: () => signupMockHostRef.value }) }));
import { and, eq } from 'drizzle-orm';
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
import { hashOtpCode } from '../phoneOtpUtils';
import { signupEmailAction } from '../signupEmailAction';
import { signupCompleteAction } from '../signupCompleteAction';
import { checkEmailAvailableAction } from '../checkEmailAvailableAction';
import { verifyEmailAction } from '../verifyEmailAction';
import { setupActionEnv, teardownActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { AuthService, __setAuthServiceForTest } from '@/lib/server/services/auth';
import { getUserRepo, getVerificationTokenRepo, getOutboxRepo, getAuditLogRepo, getPhoneOtpRepo, getWorkspaceRepo, getPgProfileRepo } from '@/lib/server/repositories/factory';

const DEFAULT_PHONE = '01099999999';
// Fixed UUID used by throwingInsertDb so VALID_SIGNUP can be a static constant.
const FAKE_OTP_ID = randomUUID();

// Fake action-db for error-tightening tests. Stubs the phone OTP pre-check so
// it passes, then throws from the user INSERT inside the transaction. The tx
// also stubs select (purgeUnverifiedSignup's "existing user?" lookup → none)
// so re-registration is a no-op and the throwing insert is reached.
function throwingInsertDb(error: unknown) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          // Outer pre-check: phone OTP lookup → verified row.
          limit: () => [{ id: FAKE_OTP_ID, phone: DEFAULT_PHONE, verifiedAt: new Date() }],
        }),
      }),
    }),
    transaction: async (cb: (tx: unknown) => unknown) =>
      cb({
        // purge's existing-user lookup → none found → no-op.
        select: () => ({ from: () => ({ where: () => ({ limit: () => [] }) }) }),
        delete: () => ({ where: () => undefined }),
        insert: () => ({ values: () => { throw error; } }),
      }),
  };
}

// 유효한 체크섬 사업자번호 (삼성전자: 124-81-00998)
const VALID_BIZ_NO = '1248100998';

const VALID_SIGNUP = {
  email: 'tighten@example.com',
  name: '테스터',
  password: 'Password123!',
  phone: DEFAULT_PHONE,
  phoneVerificationId: FAKE_OTP_ID,
  wsKind: 'buyer' as const,
  wsName: '(주)테스트',
  bizProfile: {
    bizNo: VALID_BIZ_NO,
    taxType: 'general' as const,
    status: 'active' as const,
  },
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

// Seed a verified OTP at a fixed id so VALID_SIGNUP's phoneVerificationId resolves
// against the real DB (the OTP gate now reads through PhoneOtpRepo, not the
// injected throwing _db — only the user INSERT goes through the throwing handle).
async function seedVerifiedOtpWithId(id: string, phone: string = DEFAULT_PHONE): Promise<void> {
  await db.insert(phoneOtps).values({
    id,
    phone,
    codeHash: hashOtpCode('000000'),
    expiresAt: new Date(Date.now() + 5 * 60_000),
    verifiedAt: new Date(),
  });
}

/** 이메일 발급 + 링크 클릭 소비 — signupCompleteAction의 EMAIL_NOT_VERIFIED 게이트 통과용 */
async function seedVerifiedEmail(email: string): Promise<void> {
  await signupEmailAction({ email });
  const [row] = await db
    .select({ html: outboxEntries.html })
    .from(outboxEntries)
    .where(eq(outboxEntries.toAddr, email.toLowerCase()))
    .limit(1);
  const rawToken = decodeURIComponent(row.html.match(/token=([^"]+)"/)?.[1] ?? '');
  await verifyEmailAction(rawToken);
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
    // 이메일 인증 완료 후 가입
    await seedVerifiedEmail('existing@example.com');
    await signupCompleteAction({
      email: 'existing@example.com',
      name: '기존사용자',
      password: 'Password123!',
      phone: '01011112222',
      phoneVerificationId: vid,
      wsKind: 'buyer',
      wsName: '테스트워크스페이스',
      bizProfile: { bizNo: VALID_BIZ_NO, taxType: 'general', status: 'active' },
    });

    const r = await signupEmailAction({ email: 'existing@example.com' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('EMAIL_TAKEN');
  });

  it('MASTER_EMAIL — 마스터/운영자 이메일은 인증코드 발급 없이 차단한다', async () => {
    const ORIGINAL = process.env.MASTER_ACCOUNT_EMAILS;
    process.env.MASTER_ACCOUNT_EMAILS = 'op@supporter-b.com';
    try {
      const r = await signupEmailAction({ email: 'op@supporter-b.com' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('MASTER_EMAIL');

      // 인증 메일/토큰이 발급되지 않아야 한다.
      const out = await db
        .select()
        .from(outboxEntries)
        .where(eq(outboxEntries.toAddr, 'op@supporter-b.com'));
      expect(out).toHaveLength(0);
      const tokens = await db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.email, 'op@supporter-b.com'));
      expect(tokens).toHaveLength(0);
    } finally {
      if (ORIGINAL === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
      else process.env.MASTER_ACCOUNT_EMAILS = ORIGINAL;
    }
  });
});

function tokenFromHtml(html: string): string {
  return decodeURIComponent(html.match(/token=([^"]+)"/)?.[1] ?? '');
}

describe('checkEmailAvailableAction — 마스터 이메일 차단', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('MASTER_EMAIL — 마스터 이메일은 step1 가입가능 검사에서 차단된다', async () => {
    const ORIGINAL = process.env.MASTER_ACCOUNT_EMAILS;
    process.env.MASTER_ACCOUNT_EMAILS = 'op@supporter-b.com';
    try {
      const r = await checkEmailAvailableAction({ email: 'op@supporter-b.com' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('MASTER_EMAIL');
    } finally {
      if (ORIGINAL === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
      else process.env.MASTER_ACCOUNT_EMAILS = ORIGINAL;
    }
  });
});

describe('signupCompleteAction — 마스터 이메일 차단', () => {
  let verificationId: string;

  beforeEach(async () => {
    db = await setupActionEnv();
    verificationId = await seedVerifiedOtp();
  });
  afterEach(teardownActionEnv);

  it.each(['buyer', 'pg'] as const)(
    'MASTER_EMAIL — %s 가입도 마스터 이메일이면 유저 생성 전에 차단한다',
    async (wsKind) => {
      const ORIGINAL = process.env.MASTER_ACCOUNT_EMAILS;
      process.env.MASTER_ACCOUNT_EMAILS = 'op@supporter-b.com';
      try {
        const r = await signupCompleteAction({
          email: 'op@supporter-b.com',
          name: '운영자',
          password: 'Password123!',
          phone: DEFAULT_PHONE,
          phoneVerificationId: verificationId,
          wsKind,
          wsName: '(주)테스트',
          ...(wsKind === 'buyer'
            ? { bizProfile: { bizNo: VALID_BIZ_NO, taxType: 'general' as const, status: 'active' as const } }
            : { pgProfile: { bizNo: VALID_BIZ_NO } }),
        });

        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe('MASTER_EMAIL');

        // 유저가 생성되지 않아야 한다 (orphan 방지).
        const created = await db
          .select()
          .from(users)
          .where(eq(users.email, 'op@supporter-b.com'));
        expect(created).toHaveLength(0);
      } finally {
        if (ORIGINAL === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
        else process.env.MASTER_ACCOUNT_EMAILS = ORIGINAL;
      }
    },
  );
});

describe('signupCompleteAction — buyer branch', () => {
  let verificationId: string;

  beforeEach(async () => {
    db = await setupActionEnv();
    verificationId = await seedVerifiedOtp();
    // 새 흐름: EMAIL_NOT_VERIFIED 게이트 통과를 위해 이메일 인증 먼저 완료
    await seedVerifiedEmail('kim@example.com');
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
        bizNo: VALID_BIZ_NO,
        taxType: 'general',
        status: 'active',
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
      .where(eq(bizProfiles.bizNo, VALID_BIZ_NO));
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
      bizProfile: { bizNo: VALID_BIZ_NO, taxType: 'general', status: 'active' },
    });
    expect(r.ok).toBe(false);
  });

  it('bizProfile 없는 buyer 가입은 INVALID_INPUT 반환한다', async () => {
    const r = await signupCompleteAction({
      email: 'kim2@example.com',
      name: '김구매',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'buyer',
      wsName: '(주)샘플',
      // bizProfile 없음 — 필수 refine이 거부해야 함
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it.each(['suspended', 'closed'] as const)(
    'bizProfile.status=%s 인 buyer 가입은 서버에서 INVALID_INPUT 으로 거부한다',
    async (status) => {
      const r = await signupCompleteAction({
        email: `blocked-${status}@example.com`,
        name: '김구매',
        password: 'Password123!',
        phone: DEFAULT_PHONE,
        phoneVerificationId: verificationId,
        wsKind: 'buyer',
        wsName: '(주)샘플',
        bizProfile: { bizNo: VALID_BIZ_NO, taxType: 'general', status },
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
    },
  );

  it('체크섬이 틀린 bizNo는 INVALID_INPUT 반환한다', async () => {
    const r = await signupCompleteAction({
      email: 'kim3@example.com',
      name: '김구매',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'buyer',
      wsName: '(주)샘플',
      bizProfile: {
        bizNo: '1234567890', // 10자리이지만 체크섬 불일치
        taxType: 'general',
        status: 'active',
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('returns EMAIL_TAKEN if a VERIFIED user with the email already exists', async () => {
    const ok = await signupCompleteAction({
      email: 'kim@example.com',
      name: '김구매',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'buyer',
      wsName: 'A',
      bizProfile: { bizNo: VALID_BIZ_NO, taxType: 'general', status: 'active' },
    });
    expect(ok.ok).toBe(true);
    // A *verified* account blocks re-registration (unverified would be purged).
    await db.update(users).set({ emailVerified: true }).where(eq(users.email, 'kim@example.com'));
    const dup = await signupCompleteAction({
      email: 'kim@example.com',
      name: '다른사람',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'buyer',
      wsName: 'B',
      bizProfile: { bizNo: VALID_BIZ_NO, taxType: 'general', status: 'active' },
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
    // 새 흐름: EMAIL_NOT_VERIFIED 게이트 통과용 (sales@toss.im 공통)
    await seedVerifiedEmail('sales@toss.im');
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
      pgProfile: {
        bizNo: VALID_BIZ_NO,
        // serviceScope 제거 — 가입 시 수집 안 함
      },
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

  it('creates the PG profile and exposes the owner contact (verified phone) via users — serviceScope is null (not collected at signup)', async () => {
    const r = await signupCompleteAction({
      email: 'sales@toss.im',
      name: '서포터 B 페이 영업',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'pg',
      wsName: '서포터 B 페이',
      pgProfile: {
        bizNo: VALID_BIZ_NO,
        // serviceScope 제거
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
    // serviceScope는 null 로 기록됨 — 가입 시 수집 제거
    expect(profile.serviceScope).toBeNull();

    // Inline query: find the workspace admin user contact
    const [ownerRow] = await db
      .select({ name: users.name, email: users.email, phone: users.phone })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(
        and(
          eq(workspaceMembers.workspaceId, ws.id),
          eq(workspaceMembers.role, 'admin'),
        ),
      )
      .limit(1);
    expect(ownerRow).toEqual({
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
      pgProfile: {
        bizNo: VALID_BIZ_NO,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('MISSING_WS_NAME');
  });

  it('pgProfile.bizNo 없는 PG 가입은 INVALID_INPUT 반환한다', async () => {
    // zod에서 먼저 거부 — email verification 없어도 됨
    const r = await signupCompleteAction({
      email: 'sales2@toss.im',
      name: '서포터 B 페이 영업',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'pg',
      wsName: '서포터 B 페이',
      pgProfile: {
        bizNo: '', // 빈 값 — 필수 min(10)에서 거부
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('체크섬이 틀린 PG bizNo는 INVALID_INPUT 반환한다', async () => {
    // zod에서 먼저 거부 — email verification 없어도 됨
    const r = await signupCompleteAction({
      email: 'sales3@toss.im',
      name: '서포터 B 페이 영업',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'pg',
      wsName: '서포터 B 페이',
      pgProfile: {
        bizNo: '1234567890', // 10자리이지만 체크섬 불일치
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('each PG signup creates its own workspace (no auto-join by domain)', async () => {
    const vid2 = await seedVerifiedOtp('01088880001');
    await seedVerifiedEmail('first@toss.im');
    await seedVerifiedEmail('second@toss.im');
    // 두 PG가 각각 다른 유효 사업자번호를 사용 (삼성전자, 네이버)
    const r1 = await signupCompleteAction({
      email: 'first@toss.im',
      name: '첫번째',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'pg',
      wsName: '서포터 B 페이 1팀',
      pgProfile: {
        bizNo: VALID_BIZ_NO,
      },
    });
    const r2 = await signupCompleteAction({
      email: 'second@toss.im',
      name: '두번째',
      password: 'Password123!',
      phone: '01088880001',
      phoneVerificationId: vid2,
      wsKind: 'pg',
      wsName: '서포터 B 페이 2팀',
      pgProfile: {
        bizNo: '2208104521', // 네이버: 220-81-04521
      },
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
    await seedVerifiedOtpWithId(FAKE_OTP_ID);
    const [userRepo, vtRepo, outboxRepo, auditRepo, phoneOtpRepo, workspaceRepo, pgProfileRepo] = await Promise.all([getUserRepo(), getVerificationTokenRepo(), getOutboxRepo(), getAuditLogRepo(), getPhoneOtpRepo(), getWorkspaceRepo(), getPgProfileRepo()]);
    __setAuthServiceForTest(new AuthService(
      throwingInsertDb(Object.assign(new Error('dup'), { code: '23505', constraint: 'users_email_unique' })),
      userRepo, vtRepo, outboxRepo, auditRepo, phoneOtpRepo, workspaceRepo, pgProfileRepo,
    ));
    const r = await signupCompleteAction(VALID_SIGNUP);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('EMAIL_TAKEN');
  });

  it('maps a pglite-shaped unique violation (err.cause.code) to EMAIL_TAKEN', async () => {
    await seedVerifiedOtpWithId(FAKE_OTP_ID);
    const [userRepo, vtRepo, outboxRepo, auditRepo, phoneOtpRepo, workspaceRepo, pgProfileRepo] = await Promise.all([getUserRepo(), getVerificationTokenRepo(), getOutboxRepo(), getAuditLogRepo(), getPhoneOtpRepo(), getWorkspaceRepo(), getPgProfileRepo()]);
    __setAuthServiceForTest(new AuthService(
      throwingInsertDb(Object.assign(new Error('dup'), { cause: { code: '23505', constraint: 'users_email_unique' } })),
      userRepo, vtRepo, outboxRepo, auditRepo, phoneOtpRepo, workspaceRepo, pgProfileRepo,
    ));
    const r = await signupCompleteAction(VALID_SIGNUP);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('EMAIL_TAKEN');
  });

  it('rethrows a non-unique DB error instead of masking it as EMAIL_TAKEN', async () => {
    await seedVerifiedOtpWithId(FAKE_OTP_ID);
    const [userRepo, vtRepo, outboxRepo, auditRepo, phoneOtpRepo, workspaceRepo, pgProfileRepo] = await Promise.all([getUserRepo(), getVerificationTokenRepo(), getOutboxRepo(), getAuditLogRepo(), getPhoneOtpRepo(), getWorkspaceRepo(), getPgProfileRepo()]);
    __setAuthServiceForTest(new AuthService(
      throwingInsertDb(Object.assign(new Error('not null'), { code: '23502' })),
      userRepo, vtRepo, outboxRepo, auditRepo, phoneOtpRepo, workspaceRepo, pgProfileRepo,
    ));
    await expect(signupCompleteAction(VALID_SIGNUP)).rejects.toThrow('not null');
  });
});

describe('checkEmailAvailableAction', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('returns ok:true for an email that is not registered', async () => {
    const r = await checkEmailAvailableAction({ email: 'fresh@example.com' });
    expect(r.ok).toBe(true);
  });

  it('returns ok:true (resumable) when the existing user is UNVERIFIED', async () => {
    const vid = await seedVerifiedOtp(DEFAULT_PHONE);
    // 가입했지만 이메일 미인증 상태 (이어서 가입 허용 — 결정 #2)
    await signupCompleteAction({
      email: 'pending@example.com',
      name: '테스터',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: vid,
      wsKind: 'buyer',
      wsName: '(주)테스트',
      bizProfile: { bizNo: VALID_BIZ_NO, taxType: 'general', status: 'active' },
    });

    const r = await checkEmailAvailableAction({ email: 'pending@example.com' });
    expect(r.ok).toBe(true);
  });

  it('returns EMAIL_TAKEN when a VERIFIED user with that email already exists', async () => {
    const vid = await seedVerifiedOtp(DEFAULT_PHONE);
    await signupCompleteAction({
      email: 'taken@example.com',
      name: '테스터',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: vid,
      wsKind: 'buyer',
      wsName: '(주)테스트',
      bizProfile: {
        bizNo: VALID_BIZ_NO,
        taxType: 'general',
        status: 'active',
      },
    });
    await db.update(users).set({ emailVerified: true }).where(eq(users.email, 'taken@example.com'));

    const r = await checkEmailAvailableAction({ email: 'taken@example.com' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('EMAIL_TAKEN');
  });

  it('normalises email before checking (case-insensitive)', async () => {
    const vid = await seedVerifiedOtp(DEFAULT_PHONE);
    await signupCompleteAction({
      email: 'case@example.com',
      name: '테스터',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: vid,
      wsKind: 'buyer',
      wsName: '(주)테스트',
      bizProfile: {
        bizNo: VALID_BIZ_NO,
        taxType: 'general',
        status: 'active',
      },
    });
    await db.update(users).set({ emailVerified: true }).where(eq(users.email, 'case@example.com'));

    // 대문자로 전달해도 EMAIL_TAKEN이어야 함
    const r = await checkEmailAvailableAction({ email: 'CASE@example.com' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('EMAIL_TAKEN');
  });

  it('returns INVALID_INPUT for a malformed email', async () => {
    const r = await checkEmailAvailableAction({ email: 'not-an-email' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });
});

describe('signupCompleteAction — cross-host redirect for pg signup', () => {
  let verificationId: string;
  const savedBuyer = { val: undefined as string | undefined };
  const savedPartner = { val: undefined as string | undefined };

  beforeEach(async () => {
    db = await setupActionEnv();
    verificationId = await seedVerifiedOtp();
    await seedVerifiedEmail('sales.crosshost@toss.im');
    savedBuyer.val = process.env.NEXT_PUBLIC_BUYER_ORIGIN;
    savedPartner.val = process.env.NEXT_PUBLIC_PARTNER_ORIGIN;
    process.env.NEXT_PUBLIC_BUYER_ORIGIN = 'https://supporter-b.com';
    process.env.NEXT_PUBLIC_PARTNER_ORIGIN = 'https://partner.supporter-b.com';
    signupMockHostRef.value = 'supporter-b.com';
  });
  afterEach(() => {
    teardownActionEnv();
    signupMockHostRef.value = null;
    if (savedBuyer.val === undefined) delete process.env.NEXT_PUBLIC_BUYER_ORIGIN;
    else process.env.NEXT_PUBLIC_BUYER_ORIGIN = savedBuyer.val;
    if (savedPartner.val === undefined) delete process.env.NEXT_PUBLIC_PARTNER_ORIGIN;
    else process.env.NEXT_PUBLIC_PARTNER_ORIGIN = savedPartner.val;
  });

  it('pg signup on the buyer host returns an absolute partner URL for /inbox', async () => {
    const r = await signupCompleteAction({
      email: 'sales.crosshost@toss.im',
      name: '크로스호스트 PG',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: verificationId,
      wsKind: 'pg',
      wsName: '크로스호스트 페이',
      pgProfile: {
        bizNo: VALID_BIZ_NO,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.redirectTo).toBe('https://partner.supporter-b.com/inbox');
  });
});
