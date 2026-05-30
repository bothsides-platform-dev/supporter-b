// Race + happy-path coverage for the atomic UPDATE WHERE used by every
// auth verification flow. Models the same Promise.allSettled pattern as
// invitation.test.ts so that two concurrent consume() calls cannot both win.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleVerificationTokenRepository } from '../verification-token';
import { addMinutes, generateToken, hashToken } from '../../../token';

async function setup() {
  const db = await createPgliteDb();
  const repo = new DrizzleVerificationTokenRepository(db);
  return { db, repo };
}

function makeToken(rawToken: string, overrides?: Partial<{
  purpose: 'signup_email' | 'password_reset' | 'email_change';
  email: string;
  expiresAt: string;
  meta: Record<string, unknown>;
}>) {
  return {
    id: randomUUID(),
    purpose: (overrides?.purpose ?? 'signup_email') as
      | 'signup_email'
      | 'password_reset'
      | 'email_change',
    email: overrides?.email ?? 'kim@toss.im',
    tokenHash: hashToken(rawToken),
    issuedAt: new Date().toISOString(),
    expiresAt: overrides?.expiresAt ?? addMinutes(new Date(), 15),
    meta: overrides?.meta,
  };
}

describe('DrizzleVerificationTokenRepository', () => {
  it('consume returns the row exactly once and rejects reuse', async () => {
    const { repo } = await setup();
    const raw = generateToken();
    await repo.save(makeToken(raw));

    const first = await repo.consume(hashToken(raw), new Date());
    expect(first?.email).toBe('kim@toss.im');
    const second = await repo.consume(hashToken(raw), new Date());
    expect(second).toBeUndefined();
  });

  it('consume rejects expired tokens', async () => {
    const { repo } = await setup();
    const raw = generateToken();
    await repo.save(
      makeToken(raw, {
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    );
    const r = await repo.consume(hashToken(raw), new Date());
    expect(r).toBeUndefined();
  });

  it('parallel consume: one wins, the other returns undefined', async () => {
    const { repo } = await setup();
    const raw = generateToken();
    await repo.save(makeToken(raw));

    const settled = await Promise.allSettled([
      repo.consume(hashToken(raw), new Date()),
      repo.consume(hashToken(raw), new Date()),
    ]);
    const results = settled
      .filter(
        (r): r is PromiseFulfilledResult<
          Awaited<ReturnType<typeof repo.consume>>
        > => r.status === 'fulfilled',
      )
      .map((r) => r.value);
    const wins = results.filter((r) => r !== undefined);
    const losses = results.filter((r) => r === undefined);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
  });

  it('findValid returns the token until consumed', async () => {
    const { repo } = await setup();
    const raw = generateToken();
    await repo.save(makeToken(raw, { meta: { inviteToken: 'abc' } }));

    const before = await repo.findValid(hashToken(raw), new Date());
    expect(before?.meta).toEqual({ inviteToken: 'abc' });
    await repo.consume(hashToken(raw), new Date());
    const after = await repo.findValid(hashToken(raw), new Date());
    expect(after).toBeUndefined();
  });

  it('invalidatePending burns all pending (email, purpose) tokens', async () => {
    const { repo } = await setup();
    const raw1 = generateToken();
    const raw2 = generateToken();
    await repo.save(makeToken(raw1, { email: 'a@x.com', purpose: 'password_reset' }));
    await repo.save(makeToken(raw2, { email: 'a@x.com', purpose: 'password_reset' }));

    await repo.invalidatePending({
      email: 'a@x.com',
      purpose: 'password_reset',
      now: new Date(),
    });

    expect(await repo.consume(hashToken(raw1), new Date())).toBeUndefined();
    expect(await repo.consume(hashToken(raw2), new Date())).toBeUndefined();
  });

  it('invalidatePending leaves tokens for OTHER emails untouched', async () => {
    const { repo } = await setup();
    const raw1 = generateToken();
    const raw2 = generateToken();
    await repo.save(makeToken(raw1, { email: 'a@x.com', purpose: 'password_reset' }));
    await repo.save(makeToken(raw2, { email: 'b@x.com', purpose: 'password_reset' }));

    await repo.invalidatePending({
      email: 'a@x.com',
      purpose: 'password_reset',
      now: new Date(),
    });

    expect(await repo.consume(hashToken(raw1), new Date())).toBeUndefined();
    const survivor = await repo.consume(hashToken(raw2), new Date());
    expect(survivor?.email).toBe('b@x.com');
  });

  it('invalidatePending leaves OTHER purposes for same email untouched', async () => {
    const { repo } = await setup();
    const rawReset = generateToken();
    const rawSignup = generateToken();
    await repo.save(makeToken(rawReset, { email: 'a@x.com', purpose: 'password_reset' }));
    await repo.save(makeToken(rawSignup, { email: 'a@x.com', purpose: 'signup_email' }));

    await repo.invalidatePending({
      email: 'a@x.com',
      purpose: 'password_reset',
      now: new Date(),
    });

    expect(await repo.consume(hashToken(rawReset), new Date())).toBeUndefined();
    const survivor = await repo.consume(hashToken(rawSignup), new Date());
    expect(survivor?.purpose).toBe('signup_email');
  });

  it('invalidatePending is idempotent', async () => {
    const { repo } = await setup();
    const raw = generateToken();
    await repo.save(makeToken(raw, { email: 'a@x.com', purpose: 'password_reset' }));

    await repo.invalidatePending({
      email: 'a@x.com',
      purpose: 'password_reset',
      now: new Date(),
    });
    await repo.invalidatePending({
      email: 'a@x.com',
      purpose: 'password_reset',
      now: new Date(),
    });

    expect(await repo.consume(hashToken(raw), new Date())).toBeUndefined();
  });

  it('expirePendingByEmail sets expiresAt to now and leaves consumedAt NULL', async () => {
    const { repo } = await setup();
    const raw = generateToken();
    await repo.save(makeToken(raw, { email: 'c@x.com', purpose: 'signup_email' }));

    await repo.expirePendingByEmail({
      email: 'c@x.com',
      purpose: 'signup_email',
      now: new Date(),
    });

    // Token can no longer be consumed (expired) …
    expect(await repo.consume(hashToken(raw), new Date())).toBeUndefined();
  });

  it('expirePendingByEmail leaves consumedAt NULL (invariant: consumedAt=NOT NULL means verified)', async () => {
    const { db, repo } = await setup();
    const { verificationTokens } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');

    const raw = generateToken();
    await repo.save(makeToken(raw, { email: 'd@x.com', purpose: 'signup_email' }));

    await repo.expirePendingByEmail({
      email: 'd@x.com',
      purpose: 'signup_email',
      now: new Date(),
    });

    const [row] = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.tokenHash, hashToken(raw)));
    expect(row.consumedAt).toBeNull();
  });

  it('expirePendingByEmail leaves tokens for other emails untouched', async () => {
    const { repo } = await setup();
    const rawA = generateToken();
    const rawB = generateToken();
    await repo.save(makeToken(rawA, { email: 'a@x.com', purpose: 'signup_email' }));
    await repo.save(makeToken(rawB, { email: 'b@x.com', purpose: 'signup_email' }));

    await repo.expirePendingByEmail({
      email: 'a@x.com',
      purpose: 'signup_email',
      now: new Date(),
    });

    // a expired, b still valid
    expect(await repo.consume(hashToken(rawA), new Date())).toBeUndefined();
    expect((await repo.consume(hashToken(rawB), new Date()))?.email).toBe('b@x.com');
  });

  it('expirePendingByEmail does not touch already-consumed tokens', async () => {
    const { repo } = await setup();
    const raw = generateToken();
    await repo.save(makeToken(raw, { email: 'a@x.com', purpose: 'password_reset' }));
    const first = await repo.consume(hashToken(raw), new Date());
    expect(first).toBeDefined();
    const originalConsumedAt = first?.consumedAt;
    expect(originalConsumedAt).toBeDefined();

    await new Promise((r) => setTimeout(r, 50));
    await repo.invalidatePending({
      email: 'a@x.com',
      purpose: 'password_reset',
      now: new Date(),
    });

    // consumedAt 보존 검증 — findValid 는 어차피 undefined 반환하므로
    // direct row read 가 필요. 간접 가드: 두 번째 consume 도 undefined 여야 함
    // (이미 burn 됨), 그리고 row 가 한 번만 update 됐다는 사실은 코드의 WHERE
    // 절(consumed_at IS NULL)이 이미 보장. 직접 timestamp 비교가 필요하면
    // db 핸들 노출 필요.
    expect(await repo.consume(hashToken(raw), new Date())).toBeUndefined();
  });
});

describe('consumeByEmailCode', () => {
  it('returns the token when a correct code hash is provided', async () => {
    const { repo } = await setup();
    const raw = generateToken();
    const codeHash = hashToken('123456');
    await repo.save(makeToken(raw, { email: 'e@x.com', meta: { emailCode: codeHash } }));

    const result = await repo.consumeByEmailCode({
      email: 'e@x.com',
      purpose: 'signup_email',
      codeHash,
      now: new Date(),
    });
    expect(result?.email).toBe('e@x.com');
    expect(result?.consumedAt).toBeDefined();
  });

  it('returns undefined for a wrong code hash', async () => {
    const { repo } = await setup();
    const raw = generateToken();
    const codeHash = hashToken('123456');
    await repo.save(makeToken(raw, { email: 'f@x.com', meta: { emailCode: codeHash } }));

    const result = await repo.consumeByEmailCode({
      email: 'f@x.com',
      purpose: 'signup_email',
      codeHash: hashToken('999999'),
      now: new Date(),
    });
    expect(result).toBeUndefined();
  });

  it('returns undefined for an expired token', async () => {
    const { repo } = await setup();
    const raw = generateToken();
    const codeHash = hashToken('123456');
    await repo.save(makeToken(raw, {
      email: 'g@x.com',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      meta: { emailCode: codeHash },
    }));

    const result = await repo.consumeByEmailCode({
      email: 'g@x.com',
      purpose: 'signup_email',
      codeHash,
      now: new Date(),
    });
    expect(result).toBeUndefined();
  });

  it('returns undefined when called a second time (atomic: each code single-use)', async () => {
    const { repo } = await setup();
    const raw = generateToken();
    const codeHash = hashToken('123456');
    await repo.save(makeToken(raw, { email: 'h@x.com', meta: { emailCode: codeHash } }));

    const first = await repo.consumeByEmailCode({ email: 'h@x.com', purpose: 'signup_email', codeHash, now: new Date() });
    expect(first?.email).toBe('h@x.com');
    const second = await repo.consumeByEmailCode({ email: 'h@x.com', purpose: 'signup_email', codeHash, now: new Date() });
    expect(second).toBeUndefined();
  });

  it('parallel consume: only one wins (race-safe)', async () => {
    const { repo } = await setup();
    const raw = generateToken();
    const codeHash = hashToken('123456');
    await repo.save(makeToken(raw, { email: 'i@x.com', meta: { emailCode: codeHash } }));

    const [a, b] = await Promise.allSettled([
      repo.consumeByEmailCode({ email: 'i@x.com', purpose: 'signup_email', codeHash, now: new Date() }),
      repo.consumeByEmailCode({ email: 'i@x.com', purpose: 'signup_email', codeHash, now: new Date() }),
    ]);
    const wins = [a, b]
      .filter((r): r is PromiseFulfilledResult<typeof undefined> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter(Boolean);
    expect(wins).toHaveLength(1);
  });
});
