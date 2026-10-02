import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('applies the additive signup consent DDL twice without backfilling existing users and enforces evidence constraints', async () => {
  const pg = new PGlite();
  try {
    const legacyId = randomUUID();
    await pg.exec('CREATE TABLE users (id uuid PRIMARY KEY, email text NOT NULL);');
    await pg.query('INSERT INTO users VALUES ($1, $2)', [legacyId, 'legacy@example.com']);
    const ddl = readFileSync('scripts/migrations/signup-consents.sql', 'utf8');
    await pg.exec(ddl);
    await pg.exec(ddl);

    const tables = await pg.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    expect(tables.rows.map((row) => row.tablename)).toContain('user_signup_consents');
    expect((await pg.query('SELECT * FROM user_signup_consents')).rows).toHaveLength(0);
    expect((await pg.query('SELECT * FROM users')).rows).toEqual([{ id: legacyId, email: 'legacy@example.com' }]);

    const userId = randomUUID();
    await pg.query('INSERT INTO users VALUES ($1, $2)', [userId, 'new@example.com']);
    const insert = `INSERT INTO user_signup_consents
      (user_id, terms_accepted, privacy_accepted, terms_version, privacy_version, marketing_version, terms_url, privacy_url, marketing_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;
    const values = [userId, true, true, 'test-terms', 'test-privacy', 'test-marketing',
      'https://example.com/terms', 'https://example.com/privacy', 'https://example.com/marketing'];
    for (const index of [1, 2]) {
      const invalid = [...values];
      invalid[index] = false;
      await expect(pg.query(insert, invalid)).rejects.toThrow();
    }
    for (const index of [3, 4, 5, 6, 7, 8]) {
      for (const empty of ['', '   ', null]) {
        const invalid: unknown[] = [...values];
        invalid[index] = empty;
        await expect(pg.query(insert, invalid)).rejects.toThrow();
      }
    }
    await expect(pg.query(insert, [randomUUID(), ...values.slice(1)])).rejects.toThrow();

    const started = Date.now();
    await pg.query(insert, values);
    const { rows } = await pg.query<{ marketing_accepted: boolean; recorded_at: Date }>('SELECT marketing_accepted, recorded_at FROM user_signup_consents');
    expect(rows[0].marketing_accepted).toBe(false);
    expect(new Date(rows[0].recorded_at).getTime()).toBeGreaterThanOrEqual(started);
    expect(new Date(rows[0].recorded_at).getTime()).toBeLessThanOrEqual(Date.now());
    await expect(pg.query(insert, values)).rejects.toThrow();

    await pg.query('DELETE FROM users WHERE id=$1', [userId]);
    expect((await pg.query('SELECT * FROM user_signup_consents')).rows).toHaveLength(0);
  } finally {
    await pg.close();
  }
});
