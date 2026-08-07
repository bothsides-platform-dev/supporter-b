// Drizzle outbox repository. Step 10 wires the full surface — enqueue,
// pending, markResult, and `flush(sender, limit)` which drains pending rows
// through a `Sender` under FOR UPDATE SKIP LOCKED so concurrent cron + post-
// commit callers don't double-deliver.
import { desc, eq, isNotNull, sql, lte, and, inArray, notInArray } from 'drizzle-orm';
import { outboxEntries } from '@/lib/db/schema';
import type { BatchSender, OutboxEntry, OutboxEvent } from '../../outbox/types';
import { computeBackoff } from '../../outbox/backoff';
import { sendEntriesInBatches } from '../../outbox/batch-send';
import type { OutboxRepo, Tx } from '../types';

type OutboxRow = typeof outboxEntries.$inferSelect;

function rowToEntry(row: OutboxRow): OutboxEntry {
  return {
    id: row.id,
    event: row.event as OutboxEvent,
    to: row.toAddr,
    subject: row.subject,
    html: row.html,
    dedupeKey: row.dedupeKey ?? undefined,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    scheduledAt: new Date(row.scheduledAt).toISOString(),
    sentAt: row.sentAt ? new Date(row.sentAt).toISOString() : undefined,
    lastError: row.lastError ?? undefined,
  };
}

export class DrizzleOutboxRepository implements OutboxRepo {

  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async enqueue(
    params: {
      event: OutboxEvent;
      to: string;
      subject: string;
      html: string;
      dedupeKey?: string;
      maxAttempts?: number;
      scheduledAt?: Date;
    },
    tx?: Tx,
  ): Promise<OutboxEntry | null> {
    const db = this.h(tx);
    // The dedupe_key unique index is partial (`WHERE dedupe_key IS NOT NULL`),
    // so the ON CONFLICT clause must repeat that predicate for the planner to
    // pick the right arbiter index. Without `where`, postgres errors with
    // "no unique or exclusion constraint matching the ON CONFLICT specification".
    const inserted = await db
      .insert(outboxEntries)
      .values({
        event: params.event,
        toAddr: params.to,
        subject: params.subject,
        html: params.html,
        dedupeKey: params.dedupeKey ?? null,
        maxAttempts: params.maxAttempts ?? 5,
        // Omit → column default now() (immediate). Explicit future time for
        // delayed digests (chat window-end scheduling).
        ...(params.scheduledAt ? { scheduledAt: params.scheduledAt } : {}),
      })
      .onConflictDoNothing({
        target: outboxEntries.dedupeKey,
        where: isNotNull(outboxEntries.dedupeKey),
      })
      .returning();
    return inserted.length > 0 ? rowToEntry(inserted[0]) : null;
  }

  async enqueueMany(
    params: {
      event: OutboxEvent;
      to: string;
      subject: string;
      html: string;
      dedupeKey?: string;
      maxAttempts?: number;
      scheduledAt?: Date;
    }[],
    tx?: Tx,
  ): Promise<void> {
    if (params.length === 0) return;
    const db = this.h(tx);
    // Duplicate dedupe_keys *within* this batch collapse on their own: DO
    // NOTHING (unlike DO UPDATE) arbitrates speculative insertions against
    // rows inserted earlier in the same command, so the second one is skipped
    // rather than erroring. Verified against pglite; a JS pre-pass would be
    // dead weight. Rows with a null dedupe_key never conflict — the unique
    // index is partial (`WHERE dedupe_key IS NOT NULL`).
    const rows = params.map((p) => ({
      event: p.event,
      toAddr: p.to,
      subject: p.subject,
      html: p.html,
      dedupeKey: p.dedupeKey ?? null,
      maxAttempts: p.maxAttempts ?? 5,
      ...(p.scheduledAt ? { scheduledAt: p.scheduledAt } : {}),
    }));
    await db
      .insert(outboxEntries)
      .values(rows)
      // Same partial-index predicate as `enqueue` — without the `where`,
      // postgres cannot pick the arbiter index and errors out.
      .onConflictDoNothing({
        target: outboxEntries.dedupeKey,
        where: isNotNull(outboxEntries.dedupeKey),
      });
  }

  async pending(limit: number, tx?: Tx): Promise<OutboxEntry[]> {
    const db = this.h(tx);
    const rows = await db
      .select()
      .from(outboxEntries)
      .where(
        and(
          eq(outboxEntries.status, 'pending'),
          lte(outboxEntries.scheduledAt, sql`now()`),
          // chat.message and team_chat.message rows are coalesced digests
          // handled by their dedicated flush processors (dueChatDigests /
          // dueTeamChatDigests) — the generic mailer must never drain them,
          // or it would send a raw per-message mail before the
          // window/read-state digest logic runs.
          notInArray(outboxEntries.event, ['chat.message', 'team_chat.message']),
        ),
      )
      .limit(limit);
    return rows.map(rowToEntry);
  }

  /**
   * Due chat-digest rows: `status='pending' AND event='chat.message' AND
   * scheduled_at <= now()`, ordered by scheduled_at for determinism. The
   * dedicated chat-digest processor (cron + post-commit) owns these — it
   * recomputes the digest body at flush time, short-circuits on read state,
   * then `markResult`s them. Unlike `flush`, this is a plain read with no
   * lease/SKIP-LOCKED bump; double-delivery protection lives in that
   * processor, not here.
   */
  async dueChatDigests(limit: number, tx?: Tx): Promise<OutboxEntry[]> {
    const db = this.h(tx);
    const rows = await db
      .select()
      .from(outboxEntries)
      .where(
        and(
          eq(outboxEntries.status, 'pending'),
          eq(outboxEntries.event, 'chat.message'),
          lte(outboxEntries.scheduledAt, sql`now()`),
        ),
      )
      .orderBy(outboxEntries.scheduledAt)
      .limit(limit);
    return rows.map(rowToEntry);
  }

  /**
   * Due team-chat-digest rows: `status='pending' AND event='team_chat.message'
   * AND scheduled_at <= now()`, ordered by scheduled_at for determinism.
   * Mirrors `dueChatDigests` but scoped to the team-chat digest processor.
   */
  async dueTeamChatDigests(limit: number, tx?: Tx): Promise<OutboxEntry[]> {
    const db = this.h(tx);
    const rows = await db
      .select()
      .from(outboxEntries)
      .where(
        and(
          eq(outboxEntries.status, 'pending'),
          eq(outboxEntries.event, 'team_chat.message'),
          lte(outboxEntries.scheduledAt, sql`now()`),
        ),
      )
      .orderBy(outboxEntries.scheduledAt)
      .limit(limit);
    return rows.map(rowToEntry);
  }

  async markResult(
    id: string,
    result:
      | { ok: true }
      | { ok: false; error: string; retryable?: boolean; nextScheduledAt?: Date },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    if (result.ok) {
      await db
        .update(outboxEntries)
        .set({
          status: 'sent',
          sentAt: sql`now()`,
          attempts: sql`${outboxEntries.attempts} + 1`,
        })
        .where(eq(outboxEntries.id, id));
      return;
    }

    // Increment attempts + record the error. For a RETRYABLE failure the caller
    // passes `nextScheduledAt` (now() + backoff) so the row's next attempt is
    // spread out instead of retried every tick; a permanent failure omits it
    // (the row is about to be marked failed anyway).
    if (result.nextScheduledAt) {
      await db
        .update(outboxEntries)
        .set({
          attempts: sql`${outboxEntries.attempts} + 1`,
          lastError: result.error,
          scheduledAt: result.nextScheduledAt,
        })
        .where(eq(outboxEntries.id, id));
    } else {
      await db
        .update(outboxEntries)
        .set({
          attempts: sql`${outboxEntries.attempts} + 1`,
          lastError: result.error,
        })
        .where(eq(outboxEntries.id, id));
    }

    if (result.retryable === false) {
      // Permanent (bad address / invalid sender domain / validation) — fail fast
      // so we don't burn the remaining attempts on an error that can't succeed.
      await db
        .update(outboxEntries)
        .set({ status: 'failed' })
        .where(eq(outboxEntries.id, id));
    } else {
      // Transient (rate-limit / 5xx / network) — give up only once maxAttempts
      // is reached. `retryable` undefined is treated as transient for backward
      // compatibility with legacy `{ ok: false, error }` callers.
      await db
        .update(outboxEntries)
        .set({ status: 'failed' })
        .where(
          and(
            eq(outboxEntries.id, id),
            sql`${outboxEntries.attempts} >= ${outboxEntries.maxAttempts}`,
          ),
        );
    }
  }

  /**
   * Drain pending entries through `sender`. Two-phase to avoid holding
   * row locks across the network call:
   *
   *   Phase 1 (in tx):
   *     - `SELECT ... FOR UPDATE SKIP LOCKED LIMIT $limit` claims a batch.
   *     - **Push `scheduled_at` 5 minutes into the future** for the claimed
   *       ids — this is the real lease. SKIP LOCKED alone is NOT enough:
   *       once the SELECT tx commits and locks release, a concurrent flush
   *       would otherwise see the same `status='pending', scheduled_at <=
   *       now()` rows and re-deliver. Bumping scheduled_at moves them out
   *       of the "ready" window for the lease duration.
   *     - tx commits.
   *
   *   Phase 2 (no tx): send the WHOLE claimed batch through `batchSender`
   *     (chunked to <=100/call and paced by `sendEntriesInBatches`, which is
   *     the rate-limit fix — an N-recipient fan-out becomes ceil(N/100) API
   *     calls, not N), then `markResult` per entry. markResult flips status to
   *     'sent', 'failed' (permanent, or maxAttempts reached), or reschedules a
   *     retryable failure at now()+backoff. **`markResult` already increments
   *     attempts** — flush MUST NOT increment separately or the maxAttempts →
   *     'failed' transition fires one round early.
   *
   * Crash-safety: if the worker dies between Phase 1 and markResult, the
   * row stays `status='pending'` with `scheduled_at = now()+5min`. The
   * next flush after that timestamp picks it up and re-attempts.
   */
  async flush(
    batchSender: BatchSender,
    limit: number = 50,
    _tx?: Tx,
  ): Promise<{ ok: number; failed: number }> {
    // We do NOT honour `_tx` here — flush always opens its own transaction
    // so the lease bump commits even when called from a fire-and-forget
    // caller that has no tx of its own. Accepting `_tx` keeps the
    // OutboxRepo signature uniform with the other repos.
    void _tx;
    const db = this._db;

    let ok = 0;
    let failed = 0;

    const claimed: OutboxEntry[] = await db.transaction(async (tx: Tx) => {
      const rows = await tx
        .select()
        .from(outboxEntries)
        .where(
          and(
            eq(outboxEntries.status, 'pending'),
            lte(outboxEntries.scheduledAt, sql`now()`),
            // Skip chat.message and team_chat.message rows — those are
            // coalesced digests owned by their dedicated flush processors
            // (dueChatDigests / dueTeamChatDigests). The generic mailer
            // would otherwise send a raw per-message mail.
            notInArray(outboxEntries.event, ['chat.message', 'team_chat.message']),
          ),
        )
        .orderBy(outboxEntries.scheduledAt)
        .limit(limit)
        .for('update', { skipLocked: true });

      if (rows.length === 0) return [] as OutboxEntry[];

      // Lease: push `scheduled_at` 5 min out so a concurrent flush that
      // runs after this tx commits doesn't re-see the same rows. Without
      // this, FOR UPDATE SKIP LOCKED only protects rows during this tx —
      // not across the gap between SELECT-commit and markResult.
      const ids = rows.map((r: { id: string }) => r.id);
      await tx
        .update(outboxEntries)
        .set({ scheduledAt: sql`now() + interval '5 minutes'` })
        .where(inArray(outboxEntries.id, ids));

      return rows.map(rowToEntry) as OutboxEntry[];
    });

    if (claimed.length === 0) return { ok, failed };

    // Phase 2 — one (paced, chunked) batch send for the whole claim, then map
    // each result back to its row.
    const results = await sendEntriesInBatches(batchSender, claimed);

    for (let i = 0; i < claimed.length; i++) {
      const entry = claimed[i];
      const result = results[i] ?? { ok: false as const, error: 'no_result', retryable: true };
      if (result.ok) {
        await this.markResult(entry.id, { ok: true });
        ok++;
      } else {
        // Retryable → reschedule at now()+backoff (exponential, jittered, with
        // any server Retry-After as a floor). Permanent failures fail the row
        // immediately, so they get no reschedule.
        const nextScheduledAt =
          result.retryable === false
            ? undefined
            : new Date(
                Date.now() +
                  computeBackoff(entry.attempts + 1, { retryAfterMs: result.retryAfterMs }),
              );
        await this.markResult(entry.id, {
          ok: false,
          error: result.error ?? 'unknown',
          retryable: result.retryable,
          nextScheduledAt,
        });
        failed++;
      }
    }

    return { ok, failed };
  }

  async findLatestFailed(
    params: { to: string; event: OutboxEvent },
    tx?: Tx,
  ): Promise<{ id: string } | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ id: outboxEntries.id })
      .from(outboxEntries)
      .where(
        and(
          eq(outboxEntries.toAddr, params.to),
          eq(outboxEntries.event, params.event),
          eq(outboxEntries.status, 'failed'),
        ),
      )
      .orderBy(desc(outboxEntries.scheduledAt))
      .limit(1);
    return row ? { id: row.id } : undefined;
  }

  async requeue(id: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    // failed → pending + scheduled_at 리셋. 백오프가 미래로 밀어둔 행은 리셋
    // 없이는 수동 재시도해도 그 시각까지 발송되지 않는다(폴러 조건이
    // scheduled_at <= now). attempts/lastError 는 보존 (서비스 retryEmail 패턴).
    await db
      .update(outboxEntries)
      .set({ status: 'pending', scheduledAt: sql`now()` })
      .where(eq(outboxEntries.id, id));
  }
}
