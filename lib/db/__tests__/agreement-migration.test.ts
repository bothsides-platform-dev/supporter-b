import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
it('추가 DDL은 기존 계약을 바꾸지 않고 두 번 적용해도 초안을 보존한다', async () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'scripts/migrations/long-term-agreements.sql'),
    'utf8',
  );
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE TABLE workspaces (id uuid PRIMARY KEY); CREATE TABLE signing_contracts (id uuid PRIMARY KEY, provider_ref text); INSERT INTO signing_contracts VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'legacy');",
    );
    await db.exec(sql);
    await db.exec(
      "INSERT INTO signing_agreement_drafts (contract_id, parties) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', '{}');",
    );
    await db.exec(sql);
    expect((await db.query('SELECT provider_ref FROM signing_contracts')).rows).toEqual([
      { provider_ref: 'legacy' },
    ]);
    expect((await db.query('SELECT revision FROM signing_agreement_drafts')).rows).toEqual([
      { revision: 1 },
    ]);
  } finally {
    await db.close();
  }
});
