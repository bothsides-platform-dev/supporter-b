import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('adds durable claims without changing queued mail and can be applied twice', async () => {
  const path = 'scripts/migrations/20261022-outbox-claims.sql';
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE outbox_entries(id uuid PRIMARY KEY, status text, attempts integer, scheduled_at timestamptz);
      INSERT INTO outbox_entries VALUES
      ('aaaaaaaa-0000-4000-8000-000000000001', 'pending', 2, '2026-01-01T00:00:00Z'),
      ('aaaaaaaa-0000-4000-8000-000000000002', 'sent', 1, '2026-01-02T00:00:00Z');`);
    const before = (await pg.query('SELECT * FROM outbox_entries ORDER BY id'))
      .rows;
    const migration = readFileSync(path, 'utf8');
    await pg.exec(migration);
    await pg.exec(migration);
    expect(
      (
        await pg.query(
          'SELECT id, status, attempts, scheduled_at FROM outbox_entries ORDER BY id',
        )
      ).rows,
    ).toEqual(before);
    expect(
      (
        await pg.query(
          'SELECT claim_token, claim_expires_at FROM outbox_entries',
        )
      ).rows,
    ).toEqual([
      { claim_token: null, claim_expires_at: null },
      { claim_token: null, claim_expires_at: null },
    ]);
    await expect(
      pg.exec(
        "UPDATE outbox_entries SET claim_token='bbbbbbbb-0000-4000-8000-000000000001'",
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      pg.exec('UPDATE outbox_entries SET claim_expires_at=now()'),
    ).rejects.toThrow(/check constraint/);
    await pg.exec(
      "UPDATE outbox_entries SET claim_token='bbbbbbbb-0000-4000-8000-000000000001', claim_expires_at=now()",
    );
    await pg.exec(migration);
    expect(
      (
        await pg.query(
          'SELECT count(*)::int AS n FROM outbox_entries WHERE claim_token IS NOT NULL',
        )
      ).rows,
    ).toEqual([{ n: 2 }]);
  } finally {
    await pg.close();
  }
});
