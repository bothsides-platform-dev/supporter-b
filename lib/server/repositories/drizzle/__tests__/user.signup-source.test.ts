import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleUserRepository } from '../user';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function setup() {
  const db = await createPgliteDb();
  const repo = new DrizzleUserRepository(db);
  return { db, repo };
}

describe('DrizzleUserRepository.create signupSource', () => {
  it('signupSource가 전달되면 그대로 영속된다', async () => {
    const { db, repo } = await setup();
    const id = randomUUID();

    await repo.create({
      id,
      email: `${id}@example.com`,
      passwordHash: 'hash',
      name: 'Tester',
      phone: '01000000000',
      signupSource: { _v: 1, utmSource: 'google', utmCampaign: 'brand' },
    });

    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    expect(row?.signupSource).toEqual({ _v: 1, utmSource: 'google', utmCampaign: 'brand' });
  });

  it('signupSource가 없으면 컬럼 기본값(빈 문서)으로 남는다', async () => {
    const { db, repo } = await setup();
    const id = randomUUID();

    await repo.create({
      id,
      email: `${id}@example.com`,
      passwordHash: 'hash',
      name: 'Tester',
      phone: '01000000000',
    });

    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    expect(row?.signupSource).toEqual({});
  });
});
