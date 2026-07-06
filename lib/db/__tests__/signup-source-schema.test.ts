import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { generateSchemaDDL } from '@/lib/db/schema-ddl';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { users } from '@/lib/db/schema/users';
import { eq } from 'drizzle-orm';

describe('users.signup_source column', () => {
  it('생성 DDL에 signup_source 컬럼이 포함된다', async () => {
    const ddl = (await generateSchemaDDL()).join('\n');
    expect(ddl).toContain('signup_source');
  });

  let db: PgliteDB | undefined;
  afterEach(async () => {
    await db?.$client.close();
  });

  it('기본값은 빈 버전드 문서이고, insert/select 왕복이 동작한다', async () => {
    db = await createPgliteDb();
    const id = randomUUID();
    await db.insert(users).values({
      id,
      email: `${id}@example.com`,
      passwordHash: 'hash',
      name: 'Tester',
    });

    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    expect(row?.signupSource).toEqual({});

    await db
      .update(users)
      .set({ signupSource: { _v: 1, utmSource: 'google' } })
      .where(eq(users.id, id));

    const [updated] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    expect(updated?.signupSource).toEqual({ _v: 1, utmSource: 'google' });
  });
});
