import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb } from '@/lib/db/client-pglite';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { users } from '@/lib/db/schema';
import {
  seedPgWorkspace,
  seedMembership,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { getWorkspaceAdminUser } from '../workspaceOwner';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
});

async function seedUserWithPhone(opts: {
  name: string;
  email: string;
  phone: string | null;
}): Promise<string> {
  const id = randomUUID();
  await db.insert(users).values({
    id,
    email: opts.email,
    passwordHash: 'x',
    name: opts.name,
    phone: opts.phone,
    avatarColor: 'ink',
  });
  return id;
}

describe('getWorkspaceAdminUser', () => {
  it('returns the admin member user (name/email/phone), ignoring non-admin members', async () => {
    const ws = await seedPgWorkspace(db, '서포터 B 페이');
    const adminId = await seedUserWithPhone({
      name: '서포터 B 페이 영업',
      email: 'sales@toss.im',
      phone: '01099999999',
    });
    const memberId = await seedUserWithPhone({
      name: '일반 멤버',
      email: 'member@toss.im',
      phone: '01000000000',
    });
    await seedMembership(db, ws.id, adminId, 'admin');
    await seedMembership(db, ws.id, memberId, 'member');

    const owner = await getWorkspaceAdminUser(ws.id, db);
    expect(owner).toEqual({
      name: '서포터 B 페이 영업',
      email: 'sales@toss.im',
      phone: '01099999999',
    });
  });

  it('returns null when the workspace has no admin member', async () => {
    const ws = await seedPgWorkspace(db, 'PG 무관리자');
    const memberId = await seedUserWithPhone({
      name: '멤버만',
      email: 'm@toss.im',
      phone: null,
    });
    await seedMembership(db, ws.id, memberId, 'member');

    const owner = await getWorkspaceAdminUser(ws.id, db);
    expect(owner).toBeNull();
  });
});
