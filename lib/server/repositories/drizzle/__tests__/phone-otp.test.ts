// DrizzlePhoneOtpRepository — phone-OTP issuance + verification lifecycle.
//   - countRecent() powers the send rate-limit.
//   - create() inserts a hashed-code row and returns its id.
//   - findActive() returns the NEWEST unverified, unexpired OTP (verified rows
//     are EXCLUDED — the load-bearing behavior).
//   - isVerified() / bumpAttempts() / markVerified() / remove() round-trips.
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { phoneOtps } from '@/lib/db/schema';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzlePhoneOtpRepository } from '../phone-otp';

async function setup() {
  const db = await createPgliteDb();
  return { db, repo: new DrizzlePhoneOtpRepository(db) };
}

describe('DrizzlePhoneOtpRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('create() inserts a row and returns its id; findActive() returns it', async () => {
    const id = await ctx.repo.create({
      phone: '01012345678',
      codeHash: 'hash-1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(id).toMatch(/[0-9a-f-]{36}/);

    const active = await ctx.repo.findActive('01012345678', new Date());
    expect(active).toEqual({ id, codeHash: 'hash-1', attempts: 0 });
  });

  it('countRecent() counts OTPs issued after `since` for that phone', async () => {
    await ctx.repo.create({ phone: '01000000001', codeHash: 'a', expiresAt: new Date(Date.now() + 60_000) });
    await ctx.repo.create({ phone: '01000000001', codeHash: 'b', expiresAt: new Date(Date.now() + 60_000) });
    await ctx.repo.create({ phone: '01099999999', codeHash: 'c', expiresAt: new Date(Date.now() + 60_000) });

    const since = new Date(Date.now() - 10 * 60_000);
    expect(await ctx.repo.countRecent('01000000001', since)).toBe(2);
    expect(await ctx.repo.countRecent('01099999999', since)).toBe(1);
    // Window that starts in the future excludes everything.
    expect(await ctx.repo.countRecent('01000000001', new Date(Date.now() + 60_000))).toBe(0);
  });

  it('findActive() excludes expired OTPs', async () => {
    await ctx.repo.create({
      phone: '01011112222',
      codeHash: 'expired',
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await ctx.repo.findActive('01011112222', new Date())).toBeUndefined();
  });

  it('findActive() excludes verified OTPs (load-bearing)', async () => {
    const id = await ctx.repo.create({
      phone: '01022223333',
      codeHash: 'verified',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await ctx.repo.markVerified(id, new Date());
    expect(await ctx.repo.findActive('01022223333', new Date())).toBeUndefined();
  });

  // 재전송은 이전 행을 무효화하지 않는다 — 만료(5분) 전에 재전송하면 활성 행이
  // 둘이 된다. 사용자가 손에 들고 있는 건 방금 도착한 SMS 이므로 서버도 최신 행을
  // 검증해야 한다. 가장 오래된 행을 고르면 사용자는 새 코드를 정확히 입력하고도
  // 계속 실패하며 시도 횟수(MAX_ATTEMPTS)만 소진한다.
  it('findActive() returns the NEWEST unverified row (resend must win)', async () => {
    const older = await ctx.repo.create({
      phone: '01033334444',
      codeHash: 'older',
      expiresAt: new Date(Date.now() + 60_000),
    });
    // Force the first row to have a strictly earlier created_at.
    await ctx.db
      .update(phoneOtps)
      .set({ createdAt: new Date(Date.now() - 5000) })
      .where(eq(phoneOtps.id, older));
    const newer = await ctx.repo.create({
      phone: '01033334444',
      codeHash: 'newer',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const active = await ctx.repo.findActive('01033334444', new Date());
    expect(active?.id).toBe(newer);
    expect(active?.codeHash).toBe('newer');
  });

  it('bumpAttempts() increments the attempts counter', async () => {
    const id = await ctx.repo.create({
      phone: '01044445555',
      codeHash: 'h',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await ctx.repo.bumpAttempts(id);
    await ctx.repo.bumpAttempts(id);
    const active = await ctx.repo.findActive('01044445555', new Date());
    expect(active?.attempts).toBe(2);
  });

  it('isVerified() reflects markVerified()', async () => {
    const id = await ctx.repo.create({
      phone: '01055556666',
      codeHash: 'h',
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await ctx.repo.isVerified(id, '01055556666')).toBe(false);

    await ctx.repo.markVerified(id, new Date());
    expect(await ctx.repo.isVerified(id, '01055556666')).toBe(true);
    // Wrong phone → false even though the id is verified.
    expect(await ctx.repo.isVerified(id, '09999999999')).toBe(false);
  });

  it('remove() deletes the row', async () => {
    const id = await ctx.repo.create({
      phone: '01066667777',
      codeHash: 'h',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await ctx.repo.remove(id);
    expect(await ctx.repo.findActive('01066667777', new Date())).toBeUndefined();
  });
});
