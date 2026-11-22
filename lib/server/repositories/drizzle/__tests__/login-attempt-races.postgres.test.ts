/** Real two-connection login throttle races; guarded local test DB, disposable schema only.
 * Set DATABASE_URL_TEST, then RUN_REAL_PG_LOGIN_ATTEMPT_RACES=1 pnpm test <this-file>
 */
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '@/lib/db/schema';
import { generateSchemaDDL } from '@/lib/db/schema-ddl';
import { DrizzleLoginAttemptRepository } from '../login-attempt';

const enabled = process.env.RUN_REAL_PG_LOGIN_ATTEMPT_RACES === '1';
// Any constant: it only parks reserve() between its two row locks.
const PAUSE = 40_001;

describe.skipIf(!enabled)('login attempts under real concurrent connections', () => {
  const namespace = `login_race_${randomUUID().replaceAll('-', '')}`;
  const reserver = `r_${namespace}`;
  const writer = `w_${namespace}`;
  const email = 'email:race@example.com';
  const ip = 'ip:192.0.2.1';
  const input = {
    threshold: 10,
    now: new Date('2026-11-23T00:00:00Z'),
    lockUntil: new Date('2026-11-23T00:15:00Z'),
  };
  let admin: ReturnType<typeof postgres>;
  let gate: ReturnType<typeof postgres>;
  let first: ReturnType<typeof postgres>;
  let second: ReturnType<typeof postgres>;
  let pool: ReturnType<typeof postgres>;
  const repository = (client: ReturnType<typeof postgres>) =>
    new DrizzleLoginAttemptRepository(drizzle(client, { schema, casing: 'snake_case' }));

  beforeAll(async () => {
    const connection = process.env.DATABASE_URL_TEST;
    if (!connection) throw new Error('DATABASE_URL_TEST is required for real login attempt tests');
    const target = new URL(connection);
    if (
      !['postgres:', 'postgresql:'].includes(target.protocol) ||
      !['localhost', '127.0.0.1'].includes(target.hostname) ||
      target.port !== '5433' ||
      target.pathname !== '/supporter_b_test' ||
      target.search !== '' ||
      target.hash !== ''
    ) {
      throw new Error('DATABASE_URL_TEST must target localhost:5433/supporter_b_test without URL options');
    }
    admin = postgres(connection, { max: 1, connect_timeout: 5, onnotice: () => {} });
    await admin`CREATE SCHEMA ${admin(namespace)}`;
    const settings = { search_path: namespace, statement_timeout: 10_000 };
    gate = postgres(connection, { max: 1, connection: settings });
    first = postgres(connection, { max: 1, connection: { ...settings, application_name: reserver } });
    second = postgres(connection, {
      max: 1,
      // Heap order (ip, then email) is the unsafe plan for a set-based write.
      connection: { ...settings, application_name: writer, enable_indexscan: false, enable_bitmapscan: false },
    });
    pool = postgres(connection, { max: 10, connection: settings });

    for (const ddl of await generateSchemaDDL()) {
      if (ddl.startsWith('CREATE TABLE "login_attempts"')) await gate.unsafe(ddl);
    }
    await gate.unsafe(`
      CREATE FUNCTION pause_reserve() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.key LIKE 'ip:%' AND current_setting('application_name') = '${reserver}' THEN
          PERFORM pg_advisory_xact_lock(${PAUSE});
        END IF;
        RETURN NEW;
      END $$`);
    await gate.unsafe(`
      CREATE TRIGGER pause_reserve BEFORE INSERT ON login_attempts
      FOR EACH ROW EXECUTE FUNCTION pause_reserve()`);
  });
  beforeEach(async () => {
    await gate`TRUNCATE TABLE login_attempts`;
  });
  afterAll(async () => {
    await Promise.all([gate?.end(), first?.end(), second?.end(), pool?.end()]);
    if (admin) {
      await admin`DROP SCHEMA IF EXISTS ${admin(namespace)} CASCADE`;
      await admin.end();
    }
  });

  async function waitUntilBlocked(application: string) {
    await vi.waitFor(
      async () => {
        const rows = await admin`
          SELECT 1 FROM pg_stat_activity
          WHERE application_name = ${application} AND wait_event_type = 'Lock'`;
        expect(rows).toHaveLength(1);
      },
      { timeout: 5_000, interval: 20 },
    );
  }

  it.each(['clear', 'release'] as const)(
    '%s does not deadlock with a reserve holding the email bucket',
    async (method) => {
      await gate`INSERT INTO login_attempts (key, count) VALUES (${ip}, 2)`;
      await gate`INSERT INTO login_attempts (key, count) VALUES (${email}, 2)`;
      await gate`SELECT pg_advisory_lock(${PAUSE}::bigint)`;

      let reserving: Promise<unknown> = Promise.resolve();
      let writing: Promise<unknown> = Promise.resolve();
      try {
        // Settle into values so a deadlock victim is asserted, never left unhandled.
        reserving = repository(first).reserve([email, ip], input).catch((error: unknown) => error);
        await waitUntilBlocked(reserver);
        const write =
          method === 'clear'
            ? repository(second).clear([email, ip])
            : repository(second).release([email, ip], input.threshold);
        writing = write.catch((error: unknown) => error);
        await waitUntilBlocked(writer);
      } finally {
        await gate`SELECT pg_advisory_unlock(${PAUSE}::bigint)`;
      }

      expect(await reserving).toMatchObject({ allowed: true });
      expect(await writing).toBeUndefined();
      const rows = await gate`SELECT key, count FROM login_attempts ORDER BY key`;
      expect([...rows]).toEqual(
        method === 'clear' ? [] : [{ key: email, count: 2 }, { key: ip, count: 2 }],
      );
    },
  );

  it('still admits exactly the threshold from parallel connections', async () => {
    const results = await Promise.all(
      Array.from({ length: 30 }, () => repository(pool).reserve([email, ip], input)),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(input.threshold);
  });
});
