import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { PGlite } from '@electric-sql/pglite';
import { createPgliteDb } from '@/lib/db/client-pglite';
it('upgrades the legacy draft ownership constraint and can run twice', async () => {
  const db = await createPgliteDb();
  const pg = (db as unknown as { $client: PGlite }).$client;
  await pg.exec(`DROP TABLE guest_rfp_requests;
    ALTER TABLE guest_rfp_drafts DROP CONSTRAINT guest_draft_owner_check;
    ALTER TABLE guest_rfp_drafts ADD CONSTRAINT guest_draft_owner_check CHECK (
      (user_id IS NULL AND workspace_id IS NULL AND application_id IS NULL)
      OR (user_id IS NOT NULL AND workspace_id IS NOT NULL AND application_id IS NOT NULL));`);
  const migration = await readFile(new URL('../../../scripts/migrations/20261025-guest-rfp-requests.sql', import.meta.url), 'utf8');
  await pg.exec(migration);
  await pg.exec(migration);
  const result = await pg.query<{ name: string }>("SELECT column_name AS name FROM information_schema.columns WHERE table_name='guest_rfp_requests'");
  expect(result.rows.map(row => row.name)).toEqual(expect.arrayContaining(['draft_id', 'expires_at', 'attempted_at', 'effect_seen_at', 'rfp_code']));
  const constraint = await pg.query<{ definition: string }>("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='guest_draft_owner_check'");
  const checks = await pg.query<{ name: string }>("SELECT conname AS name FROM pg_constraint WHERE conrelid='guest_rfp_requests'::regclass AND contype='c'");
  expect(checks.rows.map(row => row.name).sort()).toEqual(['guest_request_days_check', 'guest_request_status_check']);
  expect(constraint.rows[0].definition).not.toContain('application_id IS NOT NULL');
});
