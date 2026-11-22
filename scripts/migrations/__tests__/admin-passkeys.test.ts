import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { generateSchemaDDL } from '@/lib/db/schema-ddl';

const ADMIN_USERS_SQL = 'scripts/migrations/20261115-admin-users.sql';
const PASSKEYS_SQL = 'scripts/migrations/20261121-admin-passkeys.sql';

const COLUMNS = `SELECT column_name, data_type, udt_name, is_nullable, column_default
  FROM information_schema.columns WHERE table_name = 'admin_passkeys' ORDER BY column_name`;
const CONSTRAINTS = `SELECT conname, contype, pg_get_constraintdef(oid) AS definition FROM pg_constraint
  WHERE conrelid = 'admin_passkeys'::regclass ORDER BY conname`;
const INDEXES = `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'admin_passkeys' ORDER BY indexname`;

const INSERT = `INSERT INTO admin_passkeys (admin_user_id, credential_id, public_key, backup_eligible, backed_up, aaguid, label)
  VALUES ($1, $2, 'pk', false, false, '00000000-0000-0000-0000-000000000000', '회사 맥북')`;

it('패스키 DDL은 재실행 가능하고 자격증명 중복을 막으며 관리자 삭제와 함께 지워진다', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(readFileSync(ADMIN_USERS_SQL, 'utf8'));
    const ddl = readFileSync(PASSKEYS_SQL, 'utf8');
    await pg.exec(ddl); await pg.exec(ddl);

    const admin = async (email: string) =>
      (await pg.query<{ id: string }>('INSERT INTO admin_users (email) VALUES ($1) RETURNING id', [email])).rows[0].id;
    const first = await admin('ops@example.com');
    const second = await admin('other@example.com');

    await pg.query(INSERT, [first, 'cred-1']);
    await pg.query(INSERT, [first, 'cred-2']);
    // 같은 자격증명은 다른 관리자에게도 다시 등록할 수 없다.
    await expect(pg.query(INSERT, [second, 'cred-1'])).rejects.toThrow(/duplicate key/);
    await expect(pg.query(INSERT, ['aaaaaaaa-0000-4000-8000-000000000001', 'cred-3'])).rejects.toThrow(/foreign key/);

    const { rows } = await pg.query<{ sign_count: number; transports: string[] | null; last_used_at: Date | null }>(
      "SELECT sign_count, transports, last_used_at FROM admin_passkeys WHERE credential_id = 'cred-1'",
    );
    expect(rows).toEqual([{ sign_count: 0, transports: null, last_used_at: null }]);

    await pg.query('DELETE FROM admin_users WHERE id = $1', [first]);
    expect((await pg.query('SELECT count(*)::int AS n FROM admin_passkeys')).rows).toEqual([{ n: 0 }]);
  } finally { await pg.close(); }
});

it('패스키 DDL은 drizzle 스키마와 같은 컬럼·제약·인덱스를 만든다(이후 db:push no-op)', async () => {
  const fromSql = new PGlite();
  const fromSchema = new PGlite();
  try {
    await fromSql.exec(readFileSync(ADMIN_USERS_SQL, 'utf8'));
    await fromSql.exec(readFileSync(PASSKEYS_SQL, 'utf8'));

    const statements = await generateSchemaDDL();
    const adminUsers = statements.find((s) => s.includes('CREATE TABLE "admin_users"'));
    const passkeys = statements.filter((s) => s.includes('"admin_passkeys"'));
    expect(adminUsers).toBeDefined();
    // CREATE TABLE + FK + index — 스키마에 문이 늘면 마이그레이션 SQL도 함께 고친다.
    expect(passkeys).toHaveLength(3);
    await fromSchema.exec(adminUsers!);
    for (const statement of passkeys) await fromSchema.exec(statement);

    for (const query of [COLUMNS, CONSTRAINTS, INDEXES]) {
      const expected = (await fromSchema.query(query)).rows;
      expect(expected.length).toBeGreaterThan(0);
      expect((await fromSql.query(query)).rows).toEqual(expected);
    }
  } finally { await fromSql.close(); await fromSchema.close(); }
});
