// Drizzle outbox repository. Step 10 wires the full surface — enqueue,
// pending, markResult, and `flush(sender, limit)` which drains pending rows
// through a `Sender` under FOR UPDATE SKIP LOCKED so concurrent cron + post-
// commit callers don't double-deliver.
import { eq, isNotNull, sql, lte, and, inArray, notInArray } from 'drizzle-orm';
import { outboxEntries } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { OutboxEntry, OutboxEvent, Sender } from '../../outbox/types';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
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
    result: { ok: true } | { ok: false; error: string },
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
    } else {
      // Increment attempts; flip to 'failed' when max reached. Two-step is
      // simpler than a CASE expression at this layer.
      await db
        .update(outboxEntries)
        .set({
          attempts: sql`${outboxEntries.attempts} + 1`,
          lastError: result.error,
        })
        .where(eq(outboxEntries.id, id));
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
   *   Phase 2 (no tx): `sender(entry)` then `markResult` — the latter
   *     flips status to 'sent' or 'failed' (or leaves 'pending' to retry
   *     on the next tick once the 5-min lease expires). **`markResult`
   *     already increments attempts in both branches** — flush MUST NOT
   *     increment separately or the maxAttempts → 'failed' transition
   *     fires one round early.
   *
   * Crash-safety: if the worker dies between Phase 1 and markResult, the
   * row stays `status='pending'` with `scheduled_at = now()+5min`. The
   * next flush after that timestamp picks it up and re-attempts.
   */
  async flush(
    sender: Sender,
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claimed: OutboxEntry[] = await db.transaction(async (tx: any) => {
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

    for (const entry of claimed) {
      const result = await sender(entry);
      if (result.ok) {
        await this.markResult(entry.id, { ok: true });
        ok++;
      } else {
        await this.markResult(entry.id, {
          ok: false,
          error: result.error ?? 'unknown',
        });
        failed++;
      }
    }

    return { ok, failed };
  }
}
