/**
 * Real PostgreSQL retention races; each run uses its own disposable schema.
 * RUN_REAL_PG_GUEST_JOURNEY_RACES=1 pnpm test <this-file>
 * The fixed localhost test database is intentional: never use application env.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { DrizzleGuestJourneyRepository } from "../guest-journey";

const enabled = process.env.RUN_REAL_PG_GUEST_JOURNEY_RACES === "1";
const connection = "postgres://supporter_b:supporter_b@127.0.0.1:5433/supporter_b_test";
const now = new Date("2026-10-21T12:00:00Z");
const old = new Date("2026-09-01T12:00:00Z");
const owner = { userId: randomUUID(), workspaceId: randomUUID() };
const oldAnalytics = { observedAt: old.toISOString(), ga: { clientId: "1.2", sessionId: "3" } };
const newAnalytics = { observedAt: now.toISOString(), ga: { clientId: "1.2", sessionId: "4" } };

describe.skipIf(!enabled)("guest journey retention under real concurrent writes", () => {
  const namespace = `guest_journey_race_${randomUUID().replaceAll("-", "")}`;
  let admin: ReturnType<typeof postgres>;
  let writer: ReturnType<typeof postgres>;
  let cleaner: ReturnType<typeof postgres>;

  beforeAll(async () => {
    admin = postgres(connection, { max: 1, connect_timeout: 5, onnotice: () => {} });
    await admin`CREATE SCHEMA ${admin(namespace)}`;
    const options = {
      max: 1,
      connect_timeout: 5,
      connection: { search_path: namespace, statement_timeout: 10000 },
    };
    writer = postgres(connection, options);
    cleaner = postgres(connection, {
      ...options,
      connection: { ...options.connection, application_name: namespace },
    });
    await writer.unsafe(`
      CREATE TABLE users(id uuid PRIMARY KEY);
      CREATE TABLE workspaces(id uuid PRIMARY KEY);
      CREATE TABLE guest_rfp_drafts(id uuid PRIMARY KEY, user_id uuid, workspace_id uuid);
      CREATE TABLE guest_rfp_events(draft_id uuid, event text);
    `);
    await writer`INSERT INTO users VALUES (${owner.userId})`;
    await writer`INSERT INTO workspaces VALUES (${owner.workspaceId})`;
    await writer.unsafe(readFileSync("scripts/migrations/20261020-guest-journey.sql", "utf8"));
  });

  afterAll(async () => {
    await writer?.end();
    await cleaner?.end();
    if (admin) {
      await admin`DROP SCHEMA IF EXISTS ${admin(namespace)} CASCADE`;
      await admin.end();
    }
  });

  it.each(["analytics", "signup"] as const)(
    "retains the concurrent %s commit when cleanup waits on its row",
    async (kind) => {
      const db = drizzle(writer, { schema });
      const repo = new DrizzleGuestJourneyRepository(db);
      const id = randomUUID();
      await repo.start(id, "proof", 0, old);
      if (kind === "analytics") {
        await repo.bindSignup(id, "proof", owner, old);
        await repo.ingest({
          op: "events", draftId: id, expected: owner, events: [], analytics: oldAnalytics,
        }, "", owner, old);
      }
      let signalWritten!: () => void;
      let releaseWriter!: () => void;
      const written = new Promise<void>((resolve) => { signalWritten = resolve; });
      const release = new Promise<void>((resolve) => { releaseWriter = resolve; });
      const pendingWrite = db.transaction(async (tx) => {
        const inTransaction = new DrizzleGuestJourneyRepository(tx);
        if (kind === "signup") await inTransaction.bindSignup(id, "proof", owner, now);
        else await inTransaction.ingest({
          op: "events", draftId: id, expected: owner, events: [], analytics: newAnalytics,
        }, "", owner, now);
        signalWritten();
        await release;
      });
      let pendingCleanup: Promise<void> | undefined;
      try {
        await written;
        pendingCleanup = new DrizzleGuestJourneyRepository(drizzle(cleaner, { schema })).cleanup(now);
        // Observe the actual database wait before releasing the writer.
        await expect.poll(async () => {
          const [row] = await admin<{ waiting: boolean }[]>`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE application_name=${namespace} AND wait_event_type='Lock'
                AND query ILIKE '%guest_journeys%'
            ) AS waiting`;
          return row.waiting;
        }, { timeout: 5000 }).toBe(true);
      } finally {
        releaseWriter();
        await Promise.all([pendingWrite, pendingCleanup]);
      }
      const [retained] = await db.select().from(schema.guestJourneys)
        .where(eq(schema.guestJourneys.draftId, id));
      expect(retained?.userId).toBe(owner.userId);
      expect(retained?.workspaceId).toBe(owner.workspaceId);
      if (kind === "analytics") expect(retained.analytics).toEqual([newAnalytics]);
    },
  );
});
