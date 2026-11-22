import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('adds the task and receipt schema twice, retains old emails and releases the owner on admin deletion', async () => {
  const db = new PGlite();
  try {
    for (const table of [
      'workspaces',
      'rfps',
      'rfp_invitations',
      'rfp_pg_reviews',
      'bids',
      'admin_users',
      'signing_contracts',
    ])
      await db.exec(`create table ${table}(id uuid primary key)`);
    await db.exec(
      "create table outbox_entries(id uuid primary key default gen_random_uuid(), dedupe_key text, event text); insert into outbox_entries(event) values ('rfp.deadline_reminder')",
    );
    const files = ['20261122-admin-followups.sql', '20261122-reminder-receipts.sql'];
    for (let i = 0; i < 2; i++)
      for (const file of files) await db.exec(readFileSync(`scripts/migrations/${file}`, 'utf8'));
    const {
      rows: [email],
    } = await db.query<{ id: string; provider_message_id: string | null }>(
      'select id,provider_message_id from outbox_entries',
    );
    expect(email.provider_message_id).toBeNull();
    const {
      rows: [owner],
    } = await db.query<{ id: string }>('insert into admin_users values(gen_random_uuid()) returning id');
    await db.query(
      "insert into admin_followups(delivery_id,owner_id,category,title,due_at,created_by) values ($1,$2,'delivery','결과 확인',now(),'agent')",
      [email.id, owner.id],
    );
    await db.query('delete from admin_users where id=$1', [owner.id]);
    expect((await db.query('select owner_id,delivery_id from admin_followups')).rows).toEqual([
      { owner_id: null, delivery_id: email.id },
    ]);
    await expect(
      db.exec(
        "insert into admin_followups(category,title,due_at,created_by) values ('invalid','test',now(),'agent')",
      ),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
});
