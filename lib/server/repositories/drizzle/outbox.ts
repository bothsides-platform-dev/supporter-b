// Outbox persistence: enqueue, atomic claims and token-guarded completion.
// Delivery, rendering and retry timing belong to lib/server/outbox.
import { randomUUID } from 'node:crypto';
import {
  desc,
  eq,
  isNotNull,
  isNull,
  sql,
  lte,
  gt,
  and,
  or,
  inArray,
  notInArray,
} from 'drizzle-orm';
import { outboxEntries } from '@/lib/db/schema';
import type {
  ClaimedOutboxEntry,
  OutboxClaimKind,
  OutboxClaimResult,
  OutboxEntry,
  OutboxEvent,
} from '../../outbox/types';
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
          or(
            isNull(outboxEntries.claimExpiresAt),
            lte(outboxEntries.claimExpiresAt, sql`now()`),
          ),
          lte(outboxEntries.scheduledAt, sql`now()`),
          // chat.message and team_chat.message rows are coalesced digests
          // handled by their dedicated digest processors — the generic mailer must never drain them,
          // or it would send a raw per-message mail before the
          // window/read-state digest logic runs.
          notInArray(outboxEntries.event, [
            'chat.message',
            'team_chat.message',
            'signing.awaiting_template',
          ]),
        ),
      )
      .limit(limit);
    return rows.map(rowToEntry);
  }

  async claimDue(
    kind: OutboxClaimKind,
    limit: number,
  ): Promise<ClaimedOutboxEntry[]> {
    if (limit <= 0) return [];
    return this._db.transaction(async (tx: Tx) => {
      const rows = await tx
        .select()
        .from(outboxEntries)
        .where(
          and(
            eq(outboxEntries.status, 'pending'),
            lte(outboxEntries.scheduledAt, sql`now()`),
            or(
              isNull(outboxEntries.claimExpiresAt),
              lte(outboxEntries.claimExpiresAt, sql`now()`),
            ),
            kind === 'generic'
              ? notInArray(outboxEntries.event, [
                  'chat.message',
                  'team_chat.message',
                  'signing.awaiting_template',
                ])
              : eq(
                  outboxEntries.event,
                  kind === 'chat' ? 'chat.message' : 'team_chat.message',
                ),
          ),
        )
        .orderBy(outboxEntries.scheduledAt, outboxEntries.id)
        .limit(limit)
        .for('update', { skipLocked: true });
      if (rows.length === 0) return [];
      const claimToken = randomUUID();
      const claimed = await tx
        .update(outboxEntries)
        .set({
          claimToken,
          claimExpiresAt: sql`now() + interval '5 minutes'`,
        })
        .where(
          inArray(
            outboxEntries.id,
            rows.map((row) => row.id),
          ),
        )
        .returning();
      const byId = new Map(claimed.map((row) => [row.id, row]));
      return rows.map((row) => ({
        ...rowToEntry(row),
        claimToken,
        claimExpiresAt: byId.get(row.id)!.claimExpiresAt!.toISOString(),
      }));
    });
  }

  async renewClaims(
    claims: Pick<ClaimedOutboxEntry, 'id' | 'claimToken'>[],
  ): Promise<string[]> {
    if (claims.length === 0) return [];
    const renewed = await this._db
      .update(outboxEntries)
      .set({
        claimExpiresAt: sql`now() + interval '5 minutes'`,
      })
      .where(
        and(
          eq(outboxEntries.status, 'pending'),
          gt(outboxEntries.claimExpiresAt, sql`now()`),
          or(
            ...claims.map((claim) =>
              and(
                eq(outboxEntries.id, claim.id),
                eq(outboxEntries.claimToken, claim.claimToken),
              ),
            ),
          ),
        ),
      )
      .returning({ id: outboxEntries.id });
    return renewed.map((row) => row.id);
  }

  async completeClaim(
    id: string,
    claimToken: string,
    result: OutboxClaimResult,
  ): Promise<boolean> {
    const changed = await this._db
      .update(outboxEntries)
      .set({
        claimToken: null,
        claimExpiresAt: null,
        attempts: sql`${outboxEntries.attempts} + 1`,
        ...(result.ok
          ? {
              status: 'sent' as const,
              sentAt: sql`now()`,
            }
          : {
              status:
                result.retryable === false
                  ? ('failed' as const)
                  : sql`CASE WHEN ${outboxEntries.attempts} + 1 >= ${outboxEntries.maxAttempts} THEN 'failed'::outbox_status ELSE 'pending'::outbox_status END`,
              lastError: result.error,
              ...(result.nextScheduledAt
                ? { scheduledAt: result.nextScheduledAt }
                : {}),
            }),
      })
      .where(
        and(
          eq(outboxEntries.id, id),
          eq(outboxEntries.status, 'pending'),
          eq(outboxEntries.claimToken, claimToken),
          gt(outboxEntries.claimExpiresAt, sql`now()`),
        ),
      )
      .returning({ id: outboxEntries.id });
    return changed.length === 1;
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
      .set({
        status: 'pending',
        scheduledAt: sql`now()`,
        claimToken: null,
        claimExpiresAt: null,
      })
      .where(and(eq(outboxEntries.id, id), eq(outboxEntries.status, 'failed')));
  }
}
