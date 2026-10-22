/** Real two-connection claims; guarded local test DB, disposable schema only.
 * Set DATABASE_URL_TEST, then RUN_REAL_PG_OUTBOX_RACES=1 pnpm test <this-file>
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/lib/db/schema';
import { generateSchemaDDL } from '@/lib/db/schema-ddl';
import { DrizzleOutboxRepository } from '../outbox';

const enabled = process.env.RUN_REAL_PG_OUTBOX_RACES === '1';

describe.skipIf(!enabled)('outbox claims under real concurrent workers', () => {
  const namespace = `outbox_race_${randomUUID().replaceAll('-', '')}`;
  let admin: ReturnType<typeof postgres>;
  let first: ReturnType<typeof postgres>;
  let second: ReturnType<typeof postgres>;
  const database = (client: ReturnType<typeof postgres>) =>
    drizzle(client, { schema, casing: 'snake_case' });
  const repository = (client: ReturnType<typeof postgres>) =>
    new DrizzleOutboxRepository(database(client));

  beforeAll(async () => {
    const connection = process.env.DATABASE_URL_TEST;
    if (!connection)
      throw new Error('DATABASE_URL_TEST is required for real outbox tests');
    let target: URL;
    try {
      target = new URL(connection);
    } catch {
      throw new Error(
        'DATABASE_URL_TEST must be a valid local test database URL',
      );
    }
    if (
      !['postgres:', 'postgresql:'].includes(target.protocol) ||
      !['localhost', '127.0.0.1'].includes(target.hostname) ||
      target.port !== '5433' ||
      target.pathname !== '/supporter_b_test' ||
      target.search !== '' ||
      target.hash !== ''
    ) {
      throw new Error(
        'DATABASE_URL_TEST must target localhost:5433/supporter_b_test without URL options',
      );
    }
    admin = postgres(connection, {
      max: 1,
      connect_timeout: 5,
      onnotice: () => {},
    });
    await admin`CREATE SCHEMA ${admin(namespace)}`;
    const options = {
      max: 1,
      connect_timeout: 5,
      connection: { search_path: namespace, statement_timeout: 5000 },
    };
    first = postgres(connection, options);
    second = postgres(connection, options);
    // Generate the actual outbox schema, never hand-copy the columns or use public tables.
    const statements = (await generateSchemaDDL()).filter((ddl) =>
      /^CREATE (?:TYPE "public"\."outbox_|TABLE "outbox_entries"|(?:UNIQUE )?INDEX "outbox_)/.test(
        ddl,
      ),
    );
    for (const ddl of statements)
      await first.unsafe(ddl.replaceAll('"public".', `"${namespace}".`));
  });
  beforeEach(async () => {
    await first`TRUNCATE TABLE outbox_entries`;
  });
  afterAll(async () => {
    await first?.end();
    await second?.end();
    if (admin) {
      await admin`DROP SCHEMA IF EXISTS ${admin(namespace)} CASCADE`;
      await admin.end();
    }
  });

  async function enqueue() {
    return (await repository(first).enqueue({
      event: 'auth.verify',
      to: 'u@e.com',
      subject: 'S',
      html: '',
    }))!;
  }

  it('skips a row locked by another connection and claims the next row', async () => {
    const locked = await enqueue();
    const available = await enqueue();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const held = database(first).transaction(async (tx) => {
      await tx
        .select()
        .from(schema.outboxEntries)
        .where(eq(schema.outboxEntries.id, locked.id))
        .for('update');
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    let claims: Awaited<ReturnType<DrizzleOutboxRepository['claimDue']>> = [];
    try {
      claims = await repository(second).claimDue('generic', 2);
    } finally {
      release.resolve();
      await held;
    }
    expect(claims.map((entry) => entry.id)).toEqual([available.id]);
    expect(
      (await repository(first).claimDue('generic', 2)).map((entry) => entry.id),
    ).toEqual([locked.id]);
  });

  it.each(['generic', 'chat', 'team-chat'] as const)(
    'claims each %s delivery once across two workers',
    async (kind) => {
      const event =
        kind === 'generic'
          ? 'auth.verify'
          : kind === 'chat'
            ? 'chat.message'
            : 'team_chat.message';
      await repository(first).enqueueMany(
        Array.from({ length: 6 }, (_, i) => ({
          event,
          to: `u${i}@e.com`,
          subject: 'S',
          html: '',
        })),
      );
      const [a, b] = await Promise.all([
        repository(first).claimDue(kind, 4),
        repository(second).claimDue(kind, 4),
      ]);
      const ids = [...a, ...b].map((entry) => entry.id);
      expect(ids).toHaveLength(6);
      expect(new Set(ids).size).toBe(6);
      expect(await repository(first).claimDue(kind, 10)).toEqual([]);
    },
  );

  it('rejects the first connection after the second reclaims an expired row', async () => {
    await enqueue();
    const [old] = await repository(first).claimDue('generic', 1);
    await first`UPDATE outbox_entries SET claim_expires_at=now() - interval '1 second'`;
    const [current] = await repository(second).claimDue('generic', 1);
    expect(
      await repository(first).completeClaim(old.id, old.claimToken, {
        ok: false,
        error: 'late failure',
        retryable: false,
      }),
    ).toBe(false);
    expect(
      await repository(second).completeClaim(current.id, current.claimToken, {
        ok: true,
      }),
    ).toBe(true);
    expect(
      await first`SELECT status, attempts, claim_token FROM outbox_entries`,
    ).toEqual([{ status: 'sent', attempts: 1, claim_token: null }]);
  });
});
