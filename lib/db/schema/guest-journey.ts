import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";
import type {
  JourneyAnalytics,
  StoredJourneyEvent,
} from "@/lib/guest-rfp/journey-contract";
export const guestJourneys = pgTable(
  "guest_journeys",
  {
    draftId: uuid("draft_id").primaryKey(),
    secretHash: text("secret_hash").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    channel: text("channel"),
    rootTs: text("root_ts"),
    analyticsTs: text("analytics_ts"),
    analytics: jsonb("analytics")
      .$type<JourneyAnalytics[]>()
      .notNull()
      .default([]),
    analyticsVersion: integer("analytics_version").notNull().default(1),
    analyticsSentVersion: integer("analytics_sent_version")
      .notNull()
      .default(0),
  },
  (t) => [
    check(
      "guest_journey_owner_check",
      sql`num_nonnulls(${t.userId},${t.workspaceId}) IN (0,2)`,
    ),
  ],
);
export const guestJourneyBatches = pgTable(
  "guest_journey_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => guestJourneys.draftId, { onDelete: "cascade" }),
    kind: text("kind").$type<"root" | "analytics" | "events">().notNull(),
    text: text("text").notNull(),
    status: text("status")
      .$type<"pending" | "inflight" | "sent" | "unknown" | "failed">()
      .notNull()
      .default("pending"),
    analyticsVersion: integer("analytics_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    nextAt: timestamp("next_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    slackTs: text("slack_ts"),
  },
  (t) => [
    uniqueIndex("guest_journey_root_idx")
      .on(t.draftId)
      .where(sql`${t.kind}='root'`),
    index("guest_journey_batch_pending_idx").on(t.status, t.nextAt),
    check(
      "guest_journey_batches_kind_check",
      sql`${t.kind} IN ('root','analytics','events')`,
    ),
    check(
      "guest_journey_batches_status_check",
      sql`${t.status} IN ('pending','inflight','sent','unknown','failed')`,
    ),
  ],
);
export const guestJourneyEvents = pgTable(
  "guest_journey_events",
  {
    draftId: uuid("draft_id")
      .notNull()
      .references(() => guestJourneys.draftId, { onDelete: "cascade" }),
    id: text("id").notNull(),
    payload: jsonb("payload").$type<StoredJourneyEvent>().notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    batchId: uuid("batch_id").references(() => guestJourneyBatches.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    primaryKey({ columns: [t.draftId, t.id] }),
    index("guest_journey_event_pending_idx")
      .on(t.draftId, t.observedAt)
      .where(sql`${t.batchId} IS NULL`),
  ],
);
export const guestJourneyGate = pgTable(
  "guest_journey_gate",
  {
    id: integer("id").primaryKey(),
    nextAt: timestamp("next_at", { withTimezone: true }).notNull(),
  },
  (t) => [check("guest_journey_gate_id_check", sql`${t.id}=1`)],
);
