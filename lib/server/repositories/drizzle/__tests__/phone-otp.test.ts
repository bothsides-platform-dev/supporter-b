// DrizzlePhoneOtpRepository — phone-OTP issuance + verification lifecycle.
//   - countRecent() powers the send rate-limit.
//   - create() inserts a hashed-code row and returns its id.
//   - findActive() returns the NEWEST unverified, unexpired OTP (verified rows
//     are EXCLUDED — the load-bearing behavior).
//   - proof checks and consumption enforce expiry, purpose, binding, and one use.
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { phoneOtps } from '@/lib/db/schema';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzlePhoneOtpRepository } from '../phone-otp';

async function setup() {
  const db = await createPgliteDb();
  return { db, repo: new DrizzlePhoneOtpRepository(db) };
}

function signupOtp(phone: string, codeHash: string, expiresAt: Date) {
  return { phone, purpose: 'signup' as const, userId: null, codeHash, expiresAt };
}

function signupActive(phone: string, now = new Date()) {
  return { phone, purpose: 'signup' as const, userId: null, now };
}

describe('DrizzlePhoneOtpRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('create() inserts a row and returns its id; findActive() returns it', async () => {
    const id = await ctx.repo.create(
      signupOtp('01012345678', 'hash-1', new Date(Date.now() + 60_000)),
    );
    expect(id).toMatch(/[0-9a-f-]{36}/);

    const active = await ctx.repo.findActive(signupActive('01012345678'));
    expect(active).toEqual({ id, codeHash: 'hash-1', attempts: 0 });
  });

  it('countRecent() counts OTPs issued after `since` for that phone', async () => {
    await ctx.repo.create(signupOtp('01000000001', 'a', new Date(Date.now() + 60_000)));
    await ctx.repo.create(signupOtp('01000000001', 'b', new Date(Date.now() + 60_000)));
    await ctx.repo.create(signupOtp('01099999999', 'c', new Date(Date.now() + 60_000)));

    const since = new Date(Date.now() - 10 * 60_000);
    expect(await ctx.repo.countRecent('01000000001', since)).toBe(2);
    expect(await ctx.repo.countRecent('01099999999', since)).toBe(1);
    // Window that starts in the future excludes everything.
    expect(await ctx.repo.countRecent('01000000001', new Date(Date.now() + 60_000))).toBe(0);
  });

  it('findActive() excludes expired OTPs', async () => {
    await ctx.repo.create(
      signupOtp('01011112222', 'expired', new Date(Date.now() - 1000)),
    );
    expect(await ctx.repo.findActive(signupActive('01011112222'))).toBeUndefined();
  });

  it('findActive() excludes verified OTPs (load-bearing)', async () => {
    const id = await ctx.repo.create(
      signupOtp('01022223333', 'verified', new Date(Date.now() + 60_000)),
    );
    const verifiedAt = new Date();
    await ctx.repo.markVerified({
      id,
      verifiedAt,
      proofExpiresAt: new Date(verifiedAt.getTime() + 60_000),
    });
    expect(await ctx.repo.findActive(signupActive('01022223333'))).toBeUndefined();
  });

  // 재전송은 이전 행을 무효화하지 않는다 — 만료(5분) 전에 재전송하면 활성 행이
  // 둘이 된다. 사용자가 손에 들고 있는 건 방금 도착한 SMS 이므로 서버도 최신 행을
  // 검증해야 한다. 가장 오래된 행을 고르면 사용자는 새 코드를 정확히 입력하고도
  // 계속 실패하며 시도 횟수(MAX_ATTEMPTS)만 소진한다.
  it('findActive() returns the NEWEST unverified row (resend must win)', async () => {
    const older = await ctx.repo.create(
      signupOtp('01033334444', 'older', new Date(Date.now() + 60_000)),
    );
    // Force the first row to have a strictly earlier created_at.
    await ctx.db
      .update(phoneOtps)
      .set({ createdAt: new Date(Date.now() - 5000) })
      .where(eq(phoneOtps.id, older));
    const newer = await ctx.repo.create(
      signupOtp('01033334444', 'newer', new Date(Date.now() + 60_000)),
    );

    const active = await ctx.repo.findActive(signupActive('01033334444'));
    expect(active?.id).toBe(newer);
    expect(active?.codeHash).toBe('newer');
  });

  it('bumpAttempts() increments the attempts counter', async () => {
    const id = await ctx.repo.create(
      signupOtp('01044445555', 'h', new Date(Date.now() + 60_000)),
    );
    await ctx.repo.bumpAttempts(id, 5, new Date());
    await ctx.repo.bumpAttempts(id, 5, new Date());
    const active = await ctx.repo.findActive(signupActive('01044445555'));
    expect(active?.attempts).toBe(2);
  });

  it('verified proof is purpose-bound, expires, and can be consumed once', async () => {
    const id = await ctx.repo.create(
      signupOtp('01055556666', 'h', new Date(Date.now() + 60_000)),
    );
    const verifiedAt = new Date();
    const proofExpiresAt = new Date(verifiedAt.getTime() + 60_000);
    const proof = { id, ...signupActive('01055556666', verifiedAt) };

    expect(await ctx.repo.isConsumable(proof)).toBe(false);
    expect(await ctx.repo.markVerified({ id, verifiedAt, proofExpiresAt })).toBe(true);
    expect(await ctx.repo.isConsumable(proof)).toBe(true);
    expect(
      await ctx.repo.isConsumable({
        ...proof,
        purpose: 'profile_phone_update',
        userId: '00000000-0000-0000-0000-000000000001',
      }),
    ).toBe(false);
    expect(await ctx.repo.isConsumable({ ...proof, now: proofExpiresAt })).toBe(false);

    expect(await ctx.db.transaction((tx) => ctx.repo.consumeVerified(proof, tx))).toBe(true);
    expect(await ctx.db.transaction((tx) => ctx.repo.consumeVerified(proof, tx))).toBe(false);
  });

  it('concurrent consumers have exactly one winner', async () => {
    const id = await ctx.repo.create(
      signupOtp('01077778888', 'h', new Date(Date.now() + 60_000)),
    );
    const verifiedAt = new Date();
    await ctx.repo.markVerified({
      id,
      verifiedAt,
      proofExpiresAt: new Date(verifiedAt.getTime() + 60_000),
    });
    const proof = { id, ...signupActive('01077778888', verifiedAt) };

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        ctx.db.transaction((tx) => ctx.repo.consumeVerified(proof, tx)),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('a rolled-back protected transaction does not burn the proof', async () => {
    const id = await ctx.repo.create(
      signupOtp('01088889999', 'h', new Date(Date.now() + 60_000)),
    );
    const verifiedAt = new Date();
    await ctx.repo.markVerified({
      id,
      verifiedAt,
      proofExpiresAt: new Date(verifiedAt.getTime() + 60_000),
    });
    const proof = { id, ...signupActive('01088889999', verifiedAt) };

    await expect(
      ctx.db.transaction(async (tx) => {
        expect(await ctx.repo.consumeVerified(proof, tx)).toBe(true);
        throw new Error('protected write failed');
      }),
    ).rejects.toThrow('protected write failed');

    expect(await ctx.db.transaction((tx) => ctx.repo.consumeVerified(proof, tx))).toBe(true);
  });

  it('remove() deletes the row', async () => {
    const id = await ctx.repo.create(
      signupOtp('01066667777', 'h', new Date(Date.now() + 60_000)),
    );
    await ctx.repo.remove(id);
    expect(await ctx.repo.findActive(signupActive('01066667777'))).toBeUndefined();
  });
});
