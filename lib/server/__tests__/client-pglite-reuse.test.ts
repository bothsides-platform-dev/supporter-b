// Tests for createPgliteDb() singleton + truncate behaviour.
// Discriminating assertions:
//  1. Two calls return the SAME drizzle instance (reference equality).
//  2. After inserting a row and calling createPgliteDb() again,
//     the table is empty (TRUNCATE ran on the shared instance).
import { describe, it, expect } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { rfpCounters } from '@/lib/db/schema';

describe('createPgliteDb singleton + truncate', () => {
  it('returns the same db instance on repeated calls', async () => {
    const db1 = await createPgliteDb();
    const db2 = await createPgliteDb();
    // RED: current impl creates a new drizzle wrapper each call → not same ref
    expect(db1).toBe(db2);
  });

  it('truncates all user tables between calls so each call starts with empty tables', async () => {
    const db = await createPgliteDb();
    // Insert a row into a simple no-FK table
    await db.insert(rfpCounters).values({ yearMonth: '2026-01', lastSeq: 5 });
    // Re-call — should truncate, then return same instance
    const db2 = await createPgliteDb();
    const rows = await db2.select().from(rfpCounters);
    // RED: current impl returns a fresh empty db but the OLD handle still has the row.
    // After the fix both handles are the same and the truncate cleared the row.
    expect(rows).toEqual([]);
    expect(db2).toBe(db);
  });
});
