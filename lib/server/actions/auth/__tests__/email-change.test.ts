import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { outboxEntries, users } from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { setupActionEnv, teardownActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { AuthService, __setAuthServiceForTest } from '@/lib/server/services/auth';
import { getUserRepo, getVerificationTokenRepo, getOutboxRepo, getAuditLogRepo } from '@/lib/server/repositories/factory';

// requireSession() is mocked per-test so the request action can be exercised
// without a real Auth.js JWT cookie. The mock is attached before importing
// the action modules so the SUT picks up the stub at module load time.
const sessionRef: { value: { user: { id: string; isMaster?: boolean } } | null } = {
  value: null,
};
vi.mock('@/lib/auth/session', () => ({
  requireSession: () => {
    if (!sessionRef.value) {
      return Promise.reject(new Error('UNAUTHENTICATED'));
    }
    return Promise.resolve(sessionRef.value);
  },
}));

import { emailChangeRequestAction } from '../emailChangeRequestAction';
import { emailChangeConfirmAction } from '../emailChangeConfirmAction';

let db: PgliteDB;

// A fake action-db whose users UPDATE throws a chosen error — lets us drive the
// confirm action's post-update catch deterministically. The verification-token
// repo runs on the real pglite handle (separate override), so token consume
// still succeeds.
function throwingUpdateDb(error: unknown) {
  const handle = { update: () => ({ set: () => ({ where: () => { throw error; } }) }) };
  // confirmEmailChange wraps the update in a tx (audit log) — pass the same
  // throwing handle through so the error still propagates.
  return { ...handle, transaction: async (fn: (tx: unknown) => unknown) => fn(handle) };
}

async function seedUser(email: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email,
    passwordHash: await hashPassword('Password123!'),
    name: 'tester',
    avatarColor: 'ink',
  });
  return id;
}

function tokenFromOutbox(html: string): string {
  return decodeURIComponent(html.match(/token=([^"]+)"/)?.[1] ?? '');
}

describe('emailChangeRequestAction', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(() => {
    teardownActionEnv();
    sessionRef.value = null;
  });

  it('rejects without an authenticated session', async () => {
    sessionRef.value = null;
    const r = await emailChangeRequestAction({ newEmail: 'new@example.com' });
    expect(r.ok).toBe(false);
  });

  it('마스터 계정은 이메일 변경을 요청할 수 없다 → FORBIDDEN', async () => {
    const userId = await seedUser('master@example.com');
    sessionRef.value = { user: { id: userId, isMaster: true } };

    const r = await emailChangeRequestAction({ newEmail: 'new@example.com' });

    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
    const out = await db.select().from(outboxEntries);
    expect(out).toHaveLength(0);
  });

  it('issues a token + outbox row to the new address', async () => {
    const userId = await seedUser('old@example.com');
    sessionRef.value = { user: { id: userId } };

    const r = await emailChangeRequestAction({
      newEmail: 'New@Example.com',
    });
    expect(r.ok).toBe(true);

    const out = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'new@example.com'));
    expect(out).toHaveLength(1);
    expect(out[0].event).toBe('auth.email-change');
  });
});

describe('emailChangeConfirmAction', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(() => {
    teardownActionEnv();
    sessionRef.value = null;
  });

  it('updates users.email on a fresh token', async () => {
    const userId = await seedUser('old@example.com');
    sessionRef.value = { user: { id: userId } };
    await emailChangeRequestAction({ newEmail: 'new@example.com' });
    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'auth.email-change'))
      .limit(1);
    const token = tokenFromOutbox(rows[0].html);

    const r = await emailChangeConfirmAction({ rawToken: token });
    expect(r.ok).toBe(true);
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u.email).toBe('new@example.com');
  });

  it('rejects an unknown token', async () => {
    const r = await emailChangeConfirmAction({ rawToken: 'nope' });
    expect(r.ok).toBe(false);
  });

  it('rejects reused tokens', async () => {
    const userId = await seedUser('old@example.com');
    sessionRef.value = { user: { id: userId } };
    await emailChangeRequestAction({ newEmail: 'new@example.com' });
    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'auth.email-change'))
      .limit(1);
    const token = tokenFromOutbox(rows[0].html);

    const first = await emailChangeConfirmAction({ rawToken: token });
    expect(first.ok).toBe(true);
    const second = await emailChangeConfirmAction({ rawToken: token });
    expect(second.ok).toBe(false);
  });

  // --- update error tightening -------------------------------------------
  async function issueToken(): Promise<string> {
    const userId = await seedUser('old@example.com');
    sessionRef.value = { user: { id: userId } };
    await emailChangeRequestAction({ newEmail: 'new@example.com' });
    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'auth.email-change'))
      .limit(1);
    return tokenFromOutbox(rows[0].html);
  }

  it('maps a pglite-shaped unique violation (err.cause.code) to EMAIL_TAKEN', async () => {
    const token = await issueToken();
    const [userRepo, vtRepo, outboxRepo, auditRepo] = await Promise.all([getUserRepo(), getVerificationTokenRepo(), getOutboxRepo(), getAuditLogRepo()]);
    __setAuthServiceForTest(new AuthService(throwingUpdateDb({ cause: { code: '23505' } }), userRepo, vtRepo, outboxRepo, auditRepo));
    const r = await emailChangeConfirmAction({ rawToken: token });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('EMAIL_TAKEN');
  });

  it('rethrows a non-unique DB error instead of masking it as EMAIL_TAKEN', async () => {
    const token = await issueToken();
    const [userRepo, vtRepo, outboxRepo, auditRepo] = await Promise.all([getUserRepo(), getVerificationTokenRepo(), getOutboxRepo(), getAuditLogRepo()]);
    __setAuthServiceForTest(new AuthService(
      throwingUpdateDb(Object.assign(new Error('not null'), { code: '23502' })),
      userRepo, vtRepo, outboxRepo, auditRepo,
    ));
    await expect(emailChangeConfirmAction({ rawToken: token })).rejects.toThrow(
      'not null',
    );
  });
});
