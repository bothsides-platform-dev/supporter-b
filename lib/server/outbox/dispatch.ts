import type { OutboxRepo } from '@/lib/server/repositories/types';
import { computeBackoff } from './backoff';
import { sendEntriesInBatches } from './batch-send';
import type { BatchSender, ClaimedOutboxEntry } from './types';

/** Renew ownership immediately before each network batch; stale workers skip it. */
export async function deliverClaimedEntries(
  outbox: OutboxRepo,
  sender: BatchSender,
  entries: ClaimedOutboxEntry[],
): Promise<{ ok: number; failed: number }> {
  const claimsById = new Map(entries.map((entry) => [entry.id, entry]));
  let ok = 0;
  let failed = 0;
  await sendEntriesInBatches(async (chunk) => {
    const claims = chunk.map((entry) => claimsById.get(entry.id)!);
    const owned = new Set(await outbox.renewClaims(claims));
    const deliverable = claims.filter((entry) => owned.has(entry.id));
    const sent = deliverable.length > 0 ? await sender(deliverable) : [];
    const byId = new Map(deliverable.map((entry, i) => [entry.id, sent[i]]));
    const results = claims.map(
      (entry) =>
        byId.get(entry.id) ?? {
          ok: false as const,
          error: owned.has(entry.id) ? 'no_result' : 'OUTBOX_CLAIM_LOST',
          retryable: true,
        },
    );

    // Commit this network batch before a later batch can delay or fail the run.
    for (let i = 0; i < claims.length; i++) {
      const entry = claims[i];
      if (!owned.has(entry.id)) continue;
      const result = results[i];
      const committed = await outbox.completeClaim(
        entry.id,
        entry.claimToken,
        result.ok
          ? { ok: true }
          : {
              ok: false,
              error: result.error,
              retryable: result.retryable,
              nextScheduledAt:
                result.retryable === false
                  ? undefined
                  : new Date(
                      Date.now() +
                        computeBackoff(entry.attempts + 1, {
                          retryAfterMs: result.retryAfterMs,
                        }),
                    ),
            },
      );
      // Stale completion is neither a successful nor a failed delivery here.
      if (committed) {
        if (result.ok) ok++;
        else failed++;
      }
    }
    return results;
  }, entries);
  return { ok, failed };
}

export async function flushGenericOutbox(
  outbox: OutboxRepo,
  sender: BatchSender,
  limit = 50,
): Promise<{ ok: number; failed: number }> {
  return deliverClaimedEntries(
    outbox,
    sender,
    await outbox.claimDue('generic', limit),
  );
}
