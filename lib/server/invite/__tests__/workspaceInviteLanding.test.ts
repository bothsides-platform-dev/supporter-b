// accountExistsForEmail — invite landing 로그인/가입 분기 근거 (#9).
//
// 비인증 초대 유저를 가입 폼으로 보내기 전에, 초대 이메일이 이미 계정을 가졌는지
// 판정한다(인증 여부 무관 — 미인증 기존계정도 막다른 길 방지를 위해 잡아야 함).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

import { accountExistsForEmail } from '../workspaceInviteLanding';

let db: PgliteDB;

beforeEach(async () => {
  db = await createPgliteDb();
  __setActionDbForTest(db);
});

afterEach(() => {
  __setActionDbForTest(undefined);
});

describe('accountExistsForEmail', () => {
  it('returns false when no account has that email', async () => {
    expect(await accountExistsForEmail(db, 'nobody@example.com')).toBe(false);
  });

  it('returns true when a verified account exists', async () => {
    const u = await seedUser(db, { email: 'has@example.com' });
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, u.id));
    expect(await accountExistsForEmail(db, 'has@example.com')).toBe(true);
  });

  it('returns true even when the existing account is UNVERIFIED (the #8 dead-end population)', async () => {
    await seedUser(db, { email: 'unverified@example.com' }); // emailVerified defaults false
    expect(await accountExistsForEmail(db, 'unverified@example.com')).toBe(true);
  });

  it('matches case-insensitively', async () => {
    await seedUser(db, { email: 'mixed@example.com' });
    expect(await accountExistsForEmail(db, 'Mixed@Example.com')).toBe(true);
  });
});
