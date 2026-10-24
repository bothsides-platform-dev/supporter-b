import { logger } from "@/lib/observability/logger";
import type { Tx } from "../types";
import {
  and,
  eq,
  isNull,
  lt,
  gte,
  asc,
  sql,
  count,
  inArray,
} from "drizzle-orm";
import {
  guestJourneys as journeys,
  guestJourneyEvents as events,
  guestJourneyBatches as batches,
  guestJourneyGate as gate,
} from "@/lib/db/schema/guest-journey";
import {
  guestRfpEvents as legacy,
  guestRfpDrafts as drafts,
} from "@/lib/db/schema/guest-rfp";
import {
  formatJourneyAnalytics,
  formatJourneyEvents,
  type JourneyInput,
  type StoredJourneyEvent,
} from "@/lib/guest-rfp/journey-contract";
import type { Actor } from "@/lib/server/services/types";
import type { SlackThreadResult } from "@/lib/integrations/slack-thread";
import { users } from "@/lib/db/schema/users";
import { workspaces, workspaceMembers } from "@/lib/db/schema";
const DAY = 86400000;
const owned = (row: typeof journeys.$inferSelect, actor: Actor | null) =>
  !!actor &&
  row.userId === actor.userId &&
  row.workspaceId === actor.workspaceId;
export class DrizzleGuestJourneyRepository {
  constructor(private readonly db: Tx) {}
  async buyerAccess(actor: Actor, activeOnly: boolean) {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(users.id, actor.userId),
          isNull(users.deletedAt),
          eq(users.status, "active"),
          eq(workspaces.id, actor.workspaceId),
          eq(workspaces.type, "buyer"),
          inArray(
            workspaces.status,
            activeOnly ? ["active"] : ["active", "pending"],
          ),
          ...(activeOnly ? [eq(users.emailVerified, true)] : []),
        ),
      );
    return rows.length === 1;
  }
  async exists(id: string) {
    return (
      (
        await this.db
          .select({ id: journeys.draftId })
          .from(journeys)
          .where(eq(journeys.draftId, id))
      ).length > 0
    );
  }
  async isOwner(id: string, actor: Actor) {
    return (
      (
        await this.db
          .select({ id: journeys.draftId })
          .from(journeys)
          .where(
            and(
              eq(journeys.draftId, id),
              eq(journeys.userId, actor.userId),
              eq(journeys.workspaceId, actor.workspaceId),
            ),
          )
      ).length > 0
    );
  }
  async start(id: string, hash: string, attachmentCount: number, now: Date) {
    if (!hash) return false;
    return this.db.transaction(async (tx: Tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(72640204)`);
      const [existing] = await tx
        .select()
        .from(journeys)
        .where(eq(journeys.draftId, id));
      if (existing)
        return (
          existing.secretHash === hash &&
          !existing.userId &&
          !existing.retiredAt
        );
      if (
        (
          await tx
            .select({ id: legacy.draftId })
            .from(legacy)
            .where(eq(legacy.draftId, id))
            .limit(1)
        ).length
      )
        return false;
      const [daily] = await tx
        .select({ n: count() })
        .from(journeys)
        .where(gte(journeys.createdAt, new Date(+now - DAY)));
      const [proof] = await tx
        .select({ n: count() })
        .from(journeys)
        .where(and(eq(journeys.secretHash, hash), isNull(journeys.userId)));
      if (daily.n >= 1000 || proof.n >= 5) return false;
      await tx
        .insert(journeys)
        .values({ draftId: id, secretHash: hash, createdAt: now });
      await tx
        .insert(batches)
        .values({
          draftId: id,
          kind: "root",
          text: `[로그인 전 견적] 작성 시작\n초안: ${id}\n첨부: ${attachmentCount}개`,
          createdAt: now,
          nextAt: now,
        });
      return true;
    });
  }
  async ingest(
    input: JourneyInput,
    hash: string,
    actor: Actor | null,
    now: Date,
  ) {
    if (input.op === "start") return false;
    return this.db.transaction(async (tx: Tx) => {
      const [row] = await tx
        .select()
        .from(journeys)
        .where(eq(journeys.draftId, input.draftId))
        .for("update");
      if (
        !row ||
        row.deletedAt ||
        (row.retiredAt &&
          (input.op === "bind" || +row.retiredAt < +now - DAY)) ||
        (!row.userId && +row.createdAt < +now - 30 * DAY)
      )
        return false;
      const expectedMatches =
        !!actor &&
        input.expected?.userId === actor.userId &&
        input.expected?.workspaceId === actor.workspaceId;
      if (
        row.userId
          ? !owned(row, actor) || !expectedMatches
          : row.secretHash !== hash || (input.op !== "bind" && !!actor)
      )
        return false;
      if (input.op === "bind") {
        if (!expectedMatches || !actor) return false;
        // A saved signup draft may already belong to someone else.
        const [draft] = await tx
          .select({ userId: drafts.userId, workspaceId: drafts.workspaceId })
          .from(drafts)
          .where(eq(drafts.id, row.draftId));
        if (
          draft?.userId &&
          (draft.userId !== actor.userId ||
            draft.workspaceId !== actor.workspaceId)
        )
          return false;
        if (!row.userId)
          await tx
            .update(journeys)
            .set({ ...actor, analyticsVersion: row.analyticsVersion + 1 })
            .where(eq(journeys.draftId, row.draftId));
        return true;
      }
      if (input.op === "retire") {
        await tx
          .update(journeys)
          .set({ retiredAt: now, deletedAt: now })
          .where(eq(journeys.draftId, row.draftId));
        return true;
      }
      const [total] = await tx
        .select({ n: count() })
        .from(events)
        .where(eq(events.draftId, row.draftId));
      if (total.n + input.events.length > 5000) return false;
      for (const e of input.events) {
        // Client clocks are advisory. Bound skew/storage; retain repeated errors by ID.
        const at = new Date(e.observedAt);
        if (
          +at < +now - DAY ||
          +at > +now + 300000 ||
          (row.retiredAt && +at > +row.retiredAt + 300000)
        )
          continue;
        await tx
          .insert(events)
          .values({
            draftId: row.draftId,
            id: e.id,
            payload: e,
            observedAt: at,
            createdAt: now,
          })
          .onConflictDoNothing();
      }
      if (input.analytics) {
        const a = input.analytics;
        const at = new Date(a.observedAt);
        if (+at >= +now - DAY && +at <= +now + 300000) {
          const key = (v: typeof a) =>
            JSON.stringify([v.clarity ?? null, v.ga ?? null]);
          if (!row.analytics.some((s) => key(s) === key(a))) {
            await tx
              .update(journeys)
              .set({
                analytics: [...row.analytics, a].slice(-50),
                analyticsVersion: row.analyticsVersion + 1,
              })
              .where(eq(journeys.draftId, row.draftId));
          }
        }
      }
      return true;
    });
  }
  async bindSignup(id: string, hash: string, actor: Actor, now: Date) {
    return this.db.transaction(async (tx: Tx) => {
      const [row] = await tx
        .select()
        .from(journeys)
        .where(eq(journeys.draftId, id))
        .for("update");
      if (
        !row ||
        row.retiredAt ||
        row.secretHash !== hash ||
        (row.userId && !owned(row, actor))
      )
        return;
      if (!row.userId)
        await tx
          .update(journeys)
          .set({ ...actor, analyticsVersion: row.analyticsVersion + 1 })
          .where(eq(journeys.draftId, id));
      await this.serverEvent(
        id,
        "sign_up",
        "signup",
        "account_created",
        now,
        tx,
      );
    });
  }
  private async serverEvent(
    id: string,
    name: "sign_up" | "quote_request_submitted",
    funnel: "signup" | "request",
    step: string,
    now: Date,
    tx: Tx,
  ) {
    const key = name === "sign_up" ? "server:signup" : "server:request";
    const payload: StoredJourneyEvent = {
      id: key,
      name,
      funnel_id: funnel,
      step_id: step,
      observedAt: now.toISOString(),
    };
    await tx
      .insert(events)
      .values({
        draftId: id,
        id: key,
        payload,
        observedAt: now,
        createdAt: now,
      })
      .onConflictDoNothing();
  }
  async submitted(id: string, actor: Actor, now: Date) {
    return this.db.transaction(async (tx: Tx) => {
      const [row] = await tx
        .select()
        .from(journeys)
        .where(eq(journeys.draftId, id))
        .for("update");
      if (!row || row.retiredAt || !owned(row, actor)) return;
      await this.serverEvent(
        id,
        "quote_request_submitted",
        "request",
        "submitted",
        now,
        tx,
      );
      if (!row.retiredAt)
        await tx
          .update(journeys)
          .set({ retiredAt: now })
          .where(eq(journeys.draftId, id));
    });
  }
  async retire(id: string, now: Date) {
    await this.db
      .update(journeys)
      .set({ retiredAt: now, deletedAt: now })
      .where(and(eq(journeys.draftId, id), isNull(journeys.deletedAt)));
  }
  async eraseUser(userId: string) {
    await this.db.delete(journeys).where(eq(journeys.userId, userId));
  }
  async cleanup(now: Date) {
    const cutoff = new Date(+now - 30 * DAY);
    await this.db.transaction(async (tx: Tx) => {
      await tx.delete(events).where(lt(events.createdAt, cutoff));
      // Keep root/analytics delivery tombstones to prevent recreating messages.
      await tx
        .update(batches)
        .set({
          text: "",
          status: sql`CASE WHEN ${batches.status}='pending' THEN 'failed' ELSE ${batches.status} END`,
        })
        .where(and(lt(batches.createdAt, cutoff), sql`${batches.text} <> ''`));
      // Keep finish's batch-before-journey lock order. Ingest/signup share this
      // row lock, so decisions include their commits even when this read waits.
      const rows = await tx.select().from(journeys).for("update");
      for (const row of rows) {
        if (
          (row.retiredAt && row.retiredAt < cutoff) ||
          (!row.userId && row.createdAt < cutoff)
        ) {
          await tx.delete(journeys).where(eq(journeys.draftId, row.draftId));
        } else {
          const retained = row.analytics.filter(
            (s) => new Date(s.observedAt) >= cutoff,
          );
          if (retained.length !== row.analytics.length)
            await tx
              .update(journeys)
              .set({ analytics: retained })
              .where(eq(journeys.draftId, row.draftId));
        }
      }
    });
  }
  async claim(now: Date, reportUrl?: string) {
    return this.db.transaction(async (tx: Tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(72640205)`);
      // The process may have died after Slack accepted. Expiry never requeues.
      const uncertain = await tx
        .update(batches)
        .set({ status: "unknown" })
        .where(
          and(
            eq(batches.status, "inflight"),
            lt(batches.claimedAt, new Date(+now - 60000)),
          ),
        )
        .returning({ id: batches.id });
      for (const batch of uncertain)
        logger.warn("guest_journey.abandoned_claim", { batchId: batch.id });
      const [slot] = await tx
        .select()
        .from(gate)
        .where(eq(gate.id, 1))
        .for("update");
      if (!slot || slot.nextAt > now) return null;
      // Only one outstanding batch per journey; analytics is always the first reply.
      const candidates = await tx
        .select()
        .from(journeys)
        .where(
          sql`
        EXISTS (SELECT 1 FROM guest_journey_batches b WHERE b.draft_id=${journeys.draftId} AND b.status='pending' AND b.next_at <= ${now.toISOString()}::timestamptz)
        OR (${journeys.rootTs} IS NOT NULL AND (
          (${journeys.analyticsVersion} > ${journeys.analyticsSentVersion} AND NOT EXISTS
            (SELECT 1 FROM guest_journey_batches b WHERE b.draft_id=${journeys.draftId} AND b.kind='analytics' AND b.status IN ('unknown','failed')))
          OR (${journeys.analyticsTs} IS NOT NULL AND EXISTS (SELECT 1 FROM guest_journey_events e WHERE e.draft_id=${journeys.draftId} AND e.batch_id IS NULL AND e.observed_at < ${new Date(Math.floor(+now / 60000) * 60000).toISOString()}::timestamptz))
        ))`,
        )
        .orderBy(asc(journeys.createdAt))
        .limit(100);
      for (const row of candidates) {
        await tx
          .select({ id: journeys.draftId })
          .from(journeys)
          .where(eq(journeys.draftId, row.draftId))
          .for("update");
        const all = await tx
          .select()
          .from(batches)
          .where(eq(batches.draftId, row.draftId))
          .orderBy(asc(batches.createdAt));
        if (all.some((b) => b.status === "inflight")) continue;
        let batch = all.find((b) => b.status === "pending");
        if (batch && batch.nextAt > now) continue;
        if (!batch && row.rootTs) {
          if (
            row.analyticsVersion > row.analyticsSentVersion &&
            !all.some(
              (b) =>
                b.kind === "analytics" &&
                (b.status === "unknown" || b.status === "failed"),
            )
          ) {
            [batch] = await tx
              .insert(batches)
              .values({
                draftId: row.draftId,
                kind: "analytics",
                analyticsVersion: row.analyticsVersion,
                text: formatJourneyAnalytics(
                  row.analytics,
                  row.userId,
                  reportUrl,
                ),
                createdAt: now,
                nextAt: now,
              })
              .returning();
          } else if (row.analyticsTs) {
            const pending = await tx
              .select()
              .from(events)
              .where(
                and(
                  eq(events.draftId, row.draftId),
                  isNull(events.batchId),
                  lt(
                    events.observedAt,
                    new Date(Math.floor(+now / 60000) * 60000),
                  ),
                ),
              )
              .orderBy(asc(events.observedAt), asc(events.id))
              // Keep escaped answer snapshots below the Slack text limit.
              .limit(10);
            if (pending.length) {
              const minute = Math.floor(+pending[0].observedAt / 60000);
              const group = pending.filter(
                (e) => Math.floor(+e.observedAt / 60000) === minute,
              );
              [batch] = await tx
                .insert(batches)
                .values({
                  draftId: row.draftId,
                  kind: "events",
                  text: formatJourneyEvents(group.map((e) => e.payload)),
                  createdAt: now,
                  nextAt: now,
                })
                .returning();
              await tx
                .update(events)
                .set({ batchId: batch.id })
                .where(
                  and(
                    eq(events.draftId, row.draftId),
                    inArray(
                      events.id,
                      group.map((e) => e.id),
                    ),
                  ),
                );
            }
          }
        }
        if (!batch || (batch.kind !== "root" && !row.rootTs)) continue;
        await tx
          .update(batches)
          .set({ status: "inflight", claimedAt: now })
          .where(eq(batches.id, batch.id));
        await tx
          .update(gate)
          .set({ nextAt: new Date(+now + 1100) })
          .where(eq(gate.id, 1));
        return {
          ...batch,
          channel: row.channel,
          threadTs: row.rootTs,
          updateTs: batch.kind === "analytics" ? row.analyticsTs : null,
        };
      }
      return null;
    });
  }
  async finish(id: string, result: SlackThreadResult, now: Date) {
    await this.db.transaction(async (tx: Tx) => {
      const [batch] = await tx
        .select()
        .from(batches)
        .where(and(eq(batches.id, id), eq(batches.status, "inflight")))
        .for("update");
      if (!batch) return;
      if (result.status === "retry") {
        const nextAt = new Date(+now + result.retryAfterMs);
        await tx
          .update(batches)
          .set({ status: "pending", nextAt, claimedAt: null })
          .where(eq(batches.id, id));
        await tx
          .update(gate)
          .set({
            nextAt: sql`GREATEST(${gate.nextAt}, ${nextAt.toISOString()}::timestamptz)`,
          })
          .where(eq(gate.id, 1));
        return;
      }
      await tx
        .update(batches)
        .set({
          status: result.status,
          slackTs: result.status === "sent" ? result.ts : null,
        })
        .where(eq(batches.id, id));
      if (result.status === "sent") {
        if (batch.kind === "root")
          await tx
            .update(journeys)
            .set({ channel: result.channel, rootTs: result.ts })
            .where(eq(journeys.draftId, batch.draftId));
        if (batch.kind === "analytics")
          await tx
            .update(journeys)
            .set({
              analyticsTs: result.ts,
              analyticsSentVersion: batch.analyticsVersion!,
            })
            .where(eq(journeys.draftId, batch.draftId));
      }
    });
  }
}
