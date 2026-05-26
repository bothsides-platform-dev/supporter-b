import { describe, it, expect, beforeEach } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { workspaces } from '@/lib/db/schema';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;
beforeEach(async () => { db = await createPgliteDb(); });

describe('workspaces.status', () => {
  it('defaults to pending on insert', async () => {
    const [ws] = await db.insert(workspaces).values({
      type: 'pg',
      name: '테스트PG',
    }).returning();
    expect(ws.status).toBe('pending');
  });

  it('allows active and suspended values', async () => {
    const [ws] = await db.insert(workspaces).values({
      type: 'buyer',
      name: '테스트구매사',
      status: 'active',
    }).returning();
    expect(ws.status).toBe('active');
  });
});
