import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { generateSchemaDDL } from '@/lib/db/schema-ddl';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { chatConversations } from '@/lib/db/schema';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';

describe('chat_conversation_reads FK constraint names', () => {
  it('FK 이름이 63바이트 이내 명시 이름(ccr_*)으로 생성된다', async () => {
    const ddl = (await generateSchemaDDL()).join('\n');
    expect(ddl).toContain('ccr_conversation_id_fk');
    expect(ddl).toContain('ccr_workspace_id_fk');
    expect(ddl).toContain('ccr_user_id_fk');
  });

  it('deployment SQL resets legacy rows rather than inferring workspace from current membership', async () => {
    const db = await createPgliteDb();
    const migration = await readFile(
      new URL('../../../docs/migrations/2026-09-chat-read-workspace-scope.sql', import.meta.url),
      'utf8',
    );
    const pg = (db as unknown as { $client: PGlite }).$client;

    // Recreate the pre-v0.5.7.0 read-table shape inside the otherwise current
    // test schema so the operational backfill itself is exercised.
    await pg.exec(`
      ALTER TABLE chat_conversation_reads DROP CONSTRAINT ccr_workspace_id_fk;
      ALTER TABLE chat_conversation_reads
        DROP CONSTRAINT chat_conversation_reads_conversation_id_workspace_id_user_id_pk;
      ALTER TABLE chat_conversation_reads DROP COLUMN workspace_id;
      ALTER TABLE chat_conversation_reads
        ADD CONSTRAINT chat_conversation_reads_conversation_id_user_id_pk
        PRIMARY KEY (conversation_id, user_id);
    `);

    const buyer = await seedBuyerWorkspace(db);
    const pgWorkspace = await seedPgWorkspace(db, 'PG');
    const soleBuyerMember = await seedUser(db, { email: 'sole@buyer.test' });
    const dualMember = await seedUser(db, { email: 'dual@both.test' });
    await seedMembership(db, buyer.id, soleBuyerMember.id, 'member');
    await seedMembership(db, buyer.id, dualMember.id, 'member');
    await seedMembership(db, pgWorkspace.id, dualMember.id, 'member');
    const conversationId = randomUUID();
    await db.insert(chatConversations).values({
      id: conversationId,
      buyerWsId: buyer.id,
      pgWsId: pgWorkspace.id,
    });
    await pg.query(
      `INSERT INTO chat_conversation_reads
         (conversation_id, user_id, last_read_at)
       VALUES ($1, $2, now()), ($1, $3, now())`,
      [conversationId, soleBuyerMember.id, dualMember.id],
    );

    await expect(pg.exec(migration)).resolves.toBeDefined();
    const migrated = await pg.query<{
      user_id: string;
      workspace_id: string;
    }>(
      `SELECT user_id, workspace_id
       FROM chat_conversation_reads
       WHERE conversation_id = $1`,
      [conversationId],
    );
    expect(migrated.rows).toEqual([]);
    await expect(pg.exec(migration)).resolves.toBeDefined();
  });
});
