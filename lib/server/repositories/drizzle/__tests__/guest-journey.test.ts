import * as schema from "@/lib/db/schema";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it } from "vitest";
import { DrizzleGuestJourneyRepository } from "../guest-journey";
import { GuestJourneyService } from "@/lib/server/services/guest-journey";
import { sanitizeJourneyEvent } from "@/lib/guest-rfp/journey-contract";
import type { SlackThreadResult } from "@/lib/integrations/slack-thread";
const id = "10000000-0000-4000-8000-000000000001";
const owner = {
  userId: "20000000-0000-4000-8000-000000000001",
  workspaceId: "30000000-0000-4000-8000-000000000001",
};
const start = new Date("2026-10-20T05:03:01Z");
let client: PGlite, repo: DrizzleGuestJourneyRepository;
beforeEach(async () => {
  client = new PGlite();
  await client.exec(`CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE workspaces(id uuid PRIMARY KEY);
    INSERT INTO users VALUES ('${owner.userId}'); INSERT INTO workspaces VALUES ('${owner.workspaceId}');
    CREATE TABLE guest_rfp_drafts(id uuid PRIMARY KEY, user_id uuid, workspace_id uuid, completed_at timestamptz, deleted_at timestamptz);
    CREATE TABLE guest_rfp_events(draft_id uuid, event text);
  `);
  await client.exec(
    readFileSync("scripts/migrations/20261020-guest-journey.sql", "utf8"),
  );
  repo = new DrizzleGuestJourneyRepository(drizzle(client, { schema }));
});
afterEach(async () => {
  await client.close();
});
const event = (n: number, seconds = 12) => ({
  id: `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  name: "funnel_step_error" as const,
  funnel_id: "questions" as const,
  step_id: "industry",
  error_code: "VALIDATION" as const,
  observedAt: `2026-10-20T05:03:${seconds}Z`,
});
it("waits ten minutes then summarizes repeated errors without duplicate IDs", async () => {
  expect(await repo.start(id, "proof", 0, start)).toBe(true);
  await Promise.all(
    Array.from({ length: 4 }, () => repo.start(id, "proof", 0, start)),
  );
  await repo.ingest(
    { draftId: id, op: "events", events: [event(2, 28), event(1), event(1)] },
    "proof",
    null,
    start,
  );
  const messages: { text: string; threadTs?: string; updateTs?: string }[] = [];
  const svc = new GuestJourneyService(
    repo,
    async (input) => {
      messages.push(input);
      return { status: "sent", channel: "C123", ts: `${messages.length}.1` };
    },
    "C123",
  );
  await svc.flushOne(start);
  await svc.flushOne(new Date(+start + 2000));
  expect(messages).toHaveLength(2);
  expect(messages[0].threadTs).toBeUndefined();
  expect(messages[1].text).toContain("사용자 행동 보기");
  await svc.flushOne(new Date("2026-10-20T05:04:01Z"));
  expect(messages).toHaveLength(2);
  await svc.flushOne(new Date("2026-10-20T05:13:01Z"));
  expect(messages).toHaveLength(3);
  expect(messages[2].threadTs).toBe("1.1");
  expect(messages[2].text).toContain("업종 · VALIDATION: 2회");
  await svc.flushOne(new Date("2026-10-20T05:14:01Z"));
  expect(messages).toHaveLength(3);
});
it("rejects a stolen ID, binds with proof, permits the owner on another device, and rejects old anonymous or other workspace writes", async () => {
  await repo.start(id, "proof", 0, start);
  const input = { draftId: id, op: "events" as const, events: [event(1)] };
  expect(await repo.ingest(input, "wrong", null, start)).toBe(false);
  expect(
    await repo.ingest(
      { draftId: id, op: "bind", expected: owner },
      "wrong",
      owner,
      start,
    ),
  ).toBe(false);
  expect(
    await repo.ingest(
      { draftId: id, op: "bind", expected: owner },
      "proof",
      owner,
      start,
    ),
  ).toBe(true);
  expect(await repo.ingest(input, "proof", null, start)).toBe(false);
  expect(
    await repo.ingest({ ...input, expected: owner }, "", owner, start),
  ).toBe(true);
  expect(
    await repo.ingest(
      { ...input, expected: owner },
      "",
      { ...owner, workspaceId: id },
      start,
    ),
  ).toBe(false);
  expect(await repo.ingest(input, "", owner, start)).toBe(false);
});
it("honors rate-limit retry dates and never retries uncertain sends or orphaned inflight claims", async () => {
  await repo.start(id, "proof", 0, start);
  let result: SlackThreadResult = { status: "retry", retryAfterMs: 120000 },
    calls = 0;
  const svc = new GuestJourneyService(
    repo,
    async () => {
      calls++;
      return result;
    },
    "C123",
  );
  await Promise.all([svc.flushOne(start), svc.flushOne(start)]);
  expect(calls).toBe(1);
  await svc.flushOne(new Date(+start + 60000));
  expect(calls).toBe(1);
  result = { status: "unknown" };
  await svc.flushOne(new Date(+start + 120001));
  await svc.flushOne(new Date(+start + 600000));
  expect(calls).toBe(2);
  expect(
    (
      await client.query(
        `SELECT status FROM guest_journey_batches WHERE kind='root'`,
      )
    ).rows,
  ).toEqual([{ status: "unknown" }]);
});
it("updates analytics in place, keeps new sessions, and records server successes once", async () => {
  await repo.start(id, "proof", 0, start);
  await repo.bindSignup(id, "proof", owner, start);
  await repo.bindSignup(id, "proof", owner, start);
  const calls: { text: string; updateTs?: string }[] = [];
  const svc = new GuestJourneyService(
    repo,
    async (input) => {
      calls.push(input);
      return { status: "sent", channel: "C123", ts: `${calls.length}.1` };
    },
    "C123",
  );
  await svc.flushOne(start);
  await svc.flushOne(new Date(+start + 2000));
  await repo.ingest(
    {
      draftId: id,
      op: "events",
      expected: owner,
      events: [],
      analytics: {
        observedAt: start.toISOString(),
        ga: { clientId: "123.456", sessionId: "123" },
      },
    },
    "",
    owner,
    start,
  );
  await svc.flushOne(new Date(+start + 4000));
  expect(calls[2].updateTs).toBe("2.1");
  expect(calls[2].text).toContain(owner.userId);
  await repo.submitted(id, owner, start);
  await repo.submitted(id, owner, start);
  expect(
    (
      await client.query(
        `SELECT payload->>'name' AS name FROM guest_journey_events ORDER BY id`,
      )
    ).rows,
  ).toEqual([{ name: "quote_request_submitted" }, { name: "sign_up" }]);
});
it("never backfills legacy drafts and expires events while retaining unfinished owned threads", async () => {
  await client.exec(`INSERT INTO guest_rfp_events VALUES ('${id}', 'started')`);
  expect(await repo.start(id, "proof", 0, start)).toBe(false);
  await client.exec("DELETE FROM guest_rfp_events");
  await repo.start(id, "proof", 0, start);
  await repo.bindSignup(id, "proof", owner, start);
  await repo.cleanup(new Date(+start + 31 * 86400000));
  expect(
    (await client.query("SELECT * FROM guest_journey_events")).rows,
  ).toHaveLength(0);
  expect(
    (await client.query("SELECT * FROM guest_journeys")).rows,
  ).toHaveLength(1);
  await repo.submitted(id, owner, new Date(+start + 31 * 86400000));
  await repo.cleanup(new Date(+start + 62 * 86400000));
  expect(
    (await client.query("SELECT * FROM guest_journeys")).rows,
  ).toHaveLength(0);
});
it("accepts an already observed attempt arriving just after success, but not after deletion", async () => {
  await repo.start(id, "proof", 0, start);
  await repo.bindSignup(id, "proof", owner, start);
  await repo.submitted(id, owner, new Date(+start + 60000));
  const input = {
    draftId: id,
    op: "events" as const,
    expected: owner,
    events: [event(1)],
  };
  expect(await repo.ingest(input, "", owner, new Date(+start + 62000))).toBe(
    true,
  );
  await repo.retire(id, new Date(+start + 63000));
  expect(
    await repo.ingest(
      { ...input, events: [event(2)] },
      "",
      owner,
      new Date(+start + 64000),
    ),
  ).toBe(false);
});
it("marks process-crash claims uncertain and reports them instead of sending again", async () => {
  await repo.start(id, "proof", 0, start);
  expect(await repo.claim(start)).not.toBeNull();
  expect(await repo.claim(new Date(+start + 61000))).toBeNull();
  expect(
    (
      await client.query(
        `SELECT status FROM guest_journey_batches WHERE kind='root'`,
      )
    ).rows,
  ).toEqual([{ status: "unknown" }]);
});

it("retirement requires the same proof or exact current owner", async () => {
  await repo.start(id, "proof", 0, start);
  expect(
    await repo.ingest({ op: "retire", draftId: id }, "wrong", null, start),
  ).toBe(false);
  expect(
    await repo.ingest({ op: "retire", draftId: id }, "proof", null, start),
  ).toBe(true);
  expect(
    await repo.ingest(
      { op: "events", draftId: id, events: [event(1)] },
      "proof",
      null,
      start,
    ),
  ).toBe(false);
});

it("summarizes a backlog once, retaining every answer in storage and linking to detail", async () => {
 await repo.start(id, "proof", 0, start);
 for (let batch = 0; batch < 3; batch++) await repo.ingest({draftId:id, op:'events', events:
   Array.from({length:10}, (_, i) => ({...event(batch * 10 + i + 1), name:'funnel_step_complete' as const, answer:'&'.repeat(500)}))
 }, 'proof', null, start);
 const messages: string[] = [];
 const svc = new GuestJourneyService(repo, async input => {
   messages.push(input.text); return {status:'sent', channel:'C123', ts:`${messages.length}.1`};
 }, 'C123');
 await svc.flushOne(start); await svc.flushOne(new Date(+start + 2000));
 for (let i = 0; i < 4; i++) await svc.flushOne(new Date(+start + 600000 + i * 2000));
 const batches = messages.slice(2);
 expect(batches).toHaveLength(1);
 expect(batches[0].length).toBeLessThan(4000);
 expect(batches[0]).toContain(`/guest-journeys/${id}|여정 상세 보기>`);
 expect(batches[0]).not.toContain('&amp;'.repeat(500));
 expect((await client.query('SELECT payload FROM guest_journey_events WHERE batch_id IS NOT NULL')).rows).toHaveLength(30);
});

it("sends completion immediately once and keeps late observations only in detail", async () => {
  await repo.start(id, "proof", 0, start);
  await repo.bindSignup(id, "proof", owner, start);
  const messages: string[] = [];
  const svc = new GuestJourneyService(repo, async input => {
    messages.push(input.text); return { status: "sent", channel: "C123", ts: `${messages.length}.1` };
  }, "C123");
  await svc.flushOne(start);
  await svc.flushOne(new Date(+start + 2000));
  await repo.submitted(id, owner, new Date(+start + 5000));
  await Promise.all([svc.flushOne(new Date(+start + 6000)), svc.flushOne(new Date(+start + 6000))]);
  expect(messages).toHaveLength(3);
  expect(messages[2]).toContain("견적 요청 완료 (서버 확인)");
  await repo.ingest({ draftId: id, op: "events", expected: owner, events: [event(1)] }, "", owner, new Date(+start + 20000));
  await svc.flushOne(new Date(+start + 660000));
  expect(messages).toHaveLength(3);
  expect((await client.query('SELECT id FROM guest_journey_events')).rows).toHaveLength(3);
});

it("spaces summaries per journey even when old observations arrive late", async () => {
  await repo.start(id, "proof", 0, start);
  const messages: string[] = [];
  const svc = new GuestJourneyService(repo, async input => {
    messages.push(input.text); return { status: "sent", channel: "C123", ts: `${messages.length}.1` };
  }, "C123");
  await svc.flushOne(start); await svc.flushOne(new Date(+start + 2000));
  await repo.ingest({ draftId: id, op: "events", events: [event(1)] }, "proof", null, start);
  await svc.flushOne(new Date(+start + 600000));
  await repo.ingest({ draftId: id, op: "events", events: [event(2)] }, "proof", null, new Date(+start + 610000));
  await svc.flushOne(new Date(+start + 1199999));
  expect(messages).toHaveLength(3);
  await svc.flushOne(new Date(+start + 1200000));
  expect(messages).toHaveLength(4);
});

it("includes server completion even when the browser filled its entire event allowance", async () => {
  await repo.start(id, "proof", 0, start);
  await client.query(`INSERT INTO guest_journey_events (draft_id,id,payload,observed_at,created_at)
    SELECT $1, 'browser:' || n, jsonb_build_object('id', 'browser:' || n, 'name', 'funnel_step_view',
      'funnel_id','questions','step_id','website','observedAt',$2::text), $2::timestamptz, $2::timestamptz
    FROM generate_series(1,5000) AS n`, [id, start.toISOString()]);
  await repo.bindSignup(id, "proof", owner, new Date(+start + 1000));
  await repo.submitted(id, owner, new Date(+start + 2000));
  const messages: string[] = [];
  const svc = new GuestJourneyService(repo, async input => {
    messages.push(input.text); return { status: "sent", channel: "C123", ts: `${messages.length}.1` };
  }, "C123");
  for (let n = 0; n < 4; n++) await svc.flushOne(new Date(+start + 3000 + n * 2000));
  expect(messages).toHaveLength(3);
  expect(messages[2]).toContain('견적 요청 완료 (서버 확인)');
  expect((await client.query('SELECT id FROM guest_journey_events WHERE batch_id IS NULL')).rows).toHaveLength(0);
});

// Value: protects=emoji at the truncation boundary remains storable JSONB;
// fails_when=UTF-16 truncation splits a surrogate pair and poisons event ingestion;
// why_new=ASCII and Korean length tests do not cover supplementary Unicode;
// seam=none; no_claim=live Slack acceptance.
it("persists an emoji answer truncated at a surrogate boundary", async () => {
  await repo.start(id, "proof", 0, start);
  const sanitized = sanitizeJourneyEvent("funnel_step_complete", {
    funnel_id: "questions", step_id: "memo", journey_answer: "a".repeat(498) + "😀x",
  })!;
  await expect(repo.ingest({ draftId: id, op: "events", events: [{ ...sanitized, observedAt: start.toISOString() }] }, "proof", null, start)).resolves.toBe(true);
  expect((await client.query("SELECT payload->>'answer' AS answer FROM guest_journey_events")).rows).toEqual([{ answer: "a".repeat(498) + "…" }]);
});
