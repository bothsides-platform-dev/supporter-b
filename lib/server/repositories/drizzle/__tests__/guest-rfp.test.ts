import * as schema from '@/lib/db/schema';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DrizzleGuestRfpRepository } from '../guest-rfp';
it('claims each draft/event only once concurrently and retains the outcome', async () => {
  const client = new PGlite();
  try {
    await client.exec(
      readFileSync('scripts/migrations/20261011-guest-rfp-events.sql', 'utf8'),
    );
    const repo = new DrizzleGuestRfpRepository(drizzle(client, { schema }));
    const id = '10000000-0000-4000-8000-000000000001';
    expect(
      (
        await Promise.all(
          Array.from({ length: 8 }, () => repo.claim(id, 'started')),
        )
      ).filter(Boolean),
    ).toHaveLength(1);
    expect(await repo.claim(id, 'completed')).toBe(true);
    await repo.finish(id, 'started', 'failed');
    expect(await repo.claim(id, 'started')).toBe(false);
    expect(
      (
        await client.query(
          'SELECT result FROM guest_rfp_events WHERE event = $1',
          ['started'],
        )
      ).rows,
    ).toEqual([{ result: 'failed' }]);
  } finally {
    await client.close();
  }
});
it('public industry projection excludes PG membership and matching policy', async () => {
  const client = new PGlite();
  try {
    await client.exec(
      "CREATE TABLE pg_recommendation_groups (id uuid PRIMARY KEY, name text, mcc_code text, sort_order int); INSERT INTO pg_recommendation_groups VALUES ('10000000-0000-4000-8000-000000000001', '의류', '5651', 1)",
    );
    const repo = new DrizzleGuestRfpRepository(drizzle(client, { schema }));
    expect(await repo.industries()).toEqual([
      {
        id: '10000000-0000-4000-8000-000000000001',
        name: '의류',
        mccCode: '5651',
      },
    ]);
  } finally {
    await client.close();
  }
});
