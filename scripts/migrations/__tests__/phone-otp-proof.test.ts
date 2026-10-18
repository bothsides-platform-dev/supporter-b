import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('adds OTP proof fields idempotently without upgrading legacy proofs', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE phone_otps (id uuid PRIMARY KEY, verified_at timestamptz);
      INSERT INTO phone_otps VALUES ('00000000-0000-0000-0000-000000000001', now());`);
    const ddl = readFileSync('scripts/migrations/20261018-phone-otp-proof.sql', 'utf8');
    await pg.exec(ddl);
    await pg.exec(ddl);
    expect((await pg.query('SELECT purpose, user_id, proof_expires_at, consumed_at FROM phone_otps')).rows)
      .toEqual([{ purpose: null, user_id: null, proof_expires_at: null, consumed_at: null }]);
    await pg.exec("UPDATE phone_otps SET purpose = 'signup', proof_expires_at = now() + interval '5 minutes'");
    await pg.exec("UPDATE phone_otps SET purpose = 'profile_phone_update', consumed_at = now()");
    await expect(pg.exec("UPDATE phone_otps SET purpose = 'unknown'")).rejects.toThrow();
  } finally {
    await pg.close();
  }
});


it('adds upload workspace scope without assigning legacy uploads to a guessed tenant', async () => {
  const pg = new PGlite();
  try {
    await pg.exec("CREATE TABLE attachments (id uuid PRIMARY KEY); INSERT INTO attachments VALUES ('00000000-0000-0000-0000-000000000001')");
    const ddl = readFileSync('scripts/migrations/20261018-upload-workspace.sql', 'utf8');
    await pg.exec(ddl); await pg.exec(ddl);
    expect((await pg.query('SELECT upload_workspace_id FROM attachments')).rows).toEqual([{ upload_workspace_id: null }]);
  } finally { await pg.close(); }
});
