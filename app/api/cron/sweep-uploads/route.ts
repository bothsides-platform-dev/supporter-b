/**
 * POST /api/cron/sweep-uploads — periodic sweeper for abandoned two-phase
 * presigned uploads.
 *
 * Why this exists: `/api/files/presign` inserts a `pending` attachments row
 * before the client PUTs bytes to R2 and calls `/api/files/[id]/complete`.
 * A client that never finishes (tab closed mid-upload, network drop,
 * abandoned form) leaves that row `pending` forever. This is harmless
 * functionally — every read path treats `pending` as invisible/nonexistent
 * (see `app/api/files/[id]/route.ts`) — but it does leak an R2 object with
 * no live owner if bytes were actually PUT before the client bailed. This
 * cron reclaims both sides on a 1-hour cutoff:
 *
 *   1. `attachmentRepo.deleteStalePending(cutoff, SWEEP_BATCH)` deletes up to
 *      SWEEP_BATCH rows and returns their ids (row-first).
 *   2. For each returned id, best-effort `getStorage().delete(id)` — a
 *      failure here (network blip, object never actually landed) is
 *      swallowed per-id so one bad delete doesn't abort the sweep.
 *
 * Row-first ordering trade-off: if step 2 fails for an id, the row is
 * already gone but the R2 object (if it exists) survives as an orphan —
 * same accepted trade-off documented on the R2 sweeper TODO (object with
 * no row). The alternative (object-first) would instead risk a pending
 * row surviving with no object, which is strictly worse: that row is
 * already invisible everywhere, so keeping it around buys nothing, while
 * an orphan object is at least deterministically named (`attachments/<id>`)
 * and can be swept later by a bucket-side lifecycle rule.
 *
 * Why the batch is bounded: that per-id trade-off only holds while the sweep
 * actually finishes. Unbounded, a backlog (outage, upload burst) makes step 2
 * run past the platform function timeout — and since step 1 already committed
 * every row, each id the loop never reached becomes an orphan at once, with
 * nothing left pointing at those objects. SWEEP_BATCH keeps a tick finite;
 * the remainder stays `pending` and is reclaimed on the next run.
 *
 * Auth (fail-closed): identical gate to `/api/cron/flush-outbox` — CRON_SECRET
 * must be a non-empty string and match `x-cron-secret` header or `?secret=`
 * query. Unset/empty CRON_SECRET always 401s, even against a matching value.
 *
 * runtime='nodejs' — deleteStalePending transitively imports postgres-js.
 */
import { NextResponse } from 'next/server';

import { getAttachmentRepo } from '@/lib/server/repositories/factory';
import { getStorage } from '@/lib/server/storage';
import { SWEEP_BATCH } from './batch';

export const runtime = 'nodejs';

const STALE_CUTOFF_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get('x-cron-secret') ??
    new URL(request.url).searchParams.get('secret');

  // `!secret` first: an unset or empty secret fails closed before any compare,
  // so an attacker can't satisfy the gate with the empty string.
  if (!secret || provided !== secret) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_CUTOFF_MS);
  const repo = await getAttachmentRepo();
  const staleIds = await repo.deleteStalePending(cutoff, SWEEP_BATCH);

  const storage = getStorage();
  let deletedObjects = 0;
  for (const id of staleIds) {
    try {
      await storage.delete(id);
      deletedObjects += 1;
    } catch {
      // Best-effort — the object may never have landed (client bailed
      // before PUT), or the delete itself may transiently fail. Either
      // way the leftover is an orphan object, not a functional problem
      // (see module doc above); don't let one bad id abort the sweep.
    }
  }

  return NextResponse.json({
    deletedRows: staleIds.length,
    deletedObjects,
  });
}
