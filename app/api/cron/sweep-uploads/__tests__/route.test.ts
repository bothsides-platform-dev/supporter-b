/**
 * @vitest-environment node
 */
// POST /api/cron/sweep-uploads — periodic sweeper for abandoned
// two-phase presigned uploads.
//
// A presign issues a `pending` attachments row before the client PUTs
// bytes to R2 and calls `/complete`. If the client never finishes (tab
// closed, network drop, ...), the row is stuck `pending` forever and its
// existence blocks nothing functionally (pending rows are invisible to
// every read path) but does leak an R2 object with no owner. This route
// reclaims both: `attachmentRepo.deleteStalePending(cutoff)` deletes rows
// older than the cutoff and returns their ids, then we best-effort
// `getStorage().delete(id)` each one.
//
// Coverage:
//   - fail-closed auth gate (3 cases, mirrors flush-outbox)
//   - stale pending row + its object deleted
//   - fresh pending row left alone
//   - ready row left alone
//   - object delete failure for one id doesn't fail the whole sweep (200)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import { attachments } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  __resetStorageForTest,
  __setStorageForTest,
} from '@/lib/server/storage';
import { InMemoryStorage } from '@/lib/server/storage/memory';
import { SWEEP_BATCH } from '../batch';

const SECRET = 'sweep-test-secret';

let db: PgliteDB;
let storage: InMemoryStorage;
let uploaderId: string;

async function insertPending(uploadedAt: Date): Promise<string> {
  const id = randomUUID();
  await db.insert(attachments).values({
    id,
    name: 'pending.pdf',
    size: 512,
    mimeType: 'application/pdf',
    uploadedBy: uploaderId,
    status: 'pending',
    uploadedAt,
  });
  return id;
}

async function insertReady(uploadedAt: Date): Promise<string> {
  const id = randomUUID();
  await db.insert(attachments).values({
    id,
    name: 'ready.pdf',
    size: 512,
    mimeType: 'application/pdf',
    uploadedBy: uploaderId,
    status: 'ready',
    uploadedAt,
  });
  return id;
}

beforeEach(async () => {
  __resetForTest();
  __resetStorageForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  storage = new InMemoryStorage();
  __setStorageForTest(storage);
  const uploader = await seedUser(db, { email: 'sweeper-uploader@x.com' });
  uploaderId = uploader.id;
  vi.stubEnv('CRON_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function callWith(opts: { header?: string; query?: string }): Promise<Response> {
  const url = new URL('http://localhost/api/cron/sweep-uploads');
  if (opts.query !== undefined) url.searchParams.set('secret', opts.query);
  const headers = new Headers();
  if (opts.header !== undefined) headers.set('x-cron-secret', opts.header);
  return import('../route').then(({ POST }) =>
    POST(new Request(url, { method: 'POST', headers })),
  );
}

describe('POST /api/cron/sweep-uploads (auth gate)', () => {
  it('(a) wrong secret -> 401', async () => {
    const res = await callWith({ header: 'totally-wrong' });
    expect(res.status).toBe(401);
  });

  it('(a2) no secret provided -> 401', async () => {
    const res = await callWith({});
    expect(res.status).toBe(401);
  });

  it('(a3) CRON_SECRET unset (empty) -> 401 even with a matching empty value', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await callWith({ header: '' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/cron/sweep-uploads (sweep behaviour)', () => {
  it('deletes a stale pending row and its storage object', async () => {
    const staleId = await insertPending(new Date('2026-01-01T00:00:00Z'));
    await storage.save(staleId, Buffer.from('stale-bytes'), 'application/pdf');

    const res = await callWith({ header: SECRET });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedRows).toBe(1);
    expect(body.deletedObjects).toBe(1);
    await expect(storage.head(staleId)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('leaves a fresh pending row and its object untouched', async () => {
    const freshId = await insertPending(new Date());
    await storage.save(freshId, Buffer.from('fresh-bytes'), 'application/pdf');

    const res = await callWith({ header: SECRET });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedRows).toBe(0);
    await expect(storage.head(freshId)).resolves.toBeDefined();
  });

  it('leaves an old ready row untouched (only pending rows are stale-swept)', async () => {
    const readyId = await insertReady(new Date('2026-01-01T00:00:00Z'));
    await storage.save(readyId, Buffer.from('ready-bytes'), 'application/pdf');

    const res = await callWith({ header: SECRET });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedRows).toBe(0);
    await expect(storage.head(readyId)).resolves.toBeDefined();
  });

  it('returns 200 even when the storage object delete fails for a swept row', async () => {
    await insertPending(new Date('2026-01-01T00:00:00Z'));
    // No storage.save() — object is already absent so InMemoryStorage.delete()
    // is a silent no-op; to actually exercise the catch path we force delete
    // to throw for this key.
    const deleteSpy = vi
      .spyOn(storage, 'delete')
      .mockRejectedValueOnce(new Error('network blip'));

    const res = await callWith({ header: SECRET });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedRows).toBe(1);
    expect(body.deletedObjects).toBe(0);
    deleteSpy.mockRestore();
  });

  // The sweep is row-first by design (module doc): rows are deleted, then the
  // objects. That trade-off is fine per-id — an orphan object is deterministically
  // named and reclaimable by a bucket lifecycle rule, whereas a surviving pending
  // row buys nothing.
  //
  // What it does NOT survive is an unbounded batch. Deleting every stale row in
  // one statement and then serially deleting each object means a backlog (outage,
  // upload burst) runs the function past its platform timeout — and because the
  // rows were already committed, every id the loop never reached is orphaned at
  // once, with nothing left pointing at those objects. Bounding the batch keeps
  // each tick finite; the remainder stays `pending` and is swept next tick.
  describe('batch bound', () => {
    it('sweeps at most SWEEP_BATCH rows per run and leaves the rest for the next tick', async () => {
      const stale = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const total = SWEEP_BATCH + 5;
      for (let i = 0; i < total; i++) {
        const id = await insertPending(stale);
        await storage.save(id, Buffer.from('x'), 'application/pdf');
      }

      const first = await callWith({ header: SECRET });
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      expect(firstBody.deletedRows).toBe(SWEEP_BATCH);

      // The remainder must still be present — not deleted, not orphaned.
      const left = await db.select().from(attachments);
      expect(left).toHaveLength(total - SWEEP_BATCH);

      // …and a following tick finishes the job.
      const second = await callWith({ header: SECRET });
      const secondBody = await second.json();
      expect(secondBody.deletedRows).toBe(total - SWEEP_BATCH);
      expect(await db.select().from(attachments)).toHaveLength(0);
    });
  });
});
