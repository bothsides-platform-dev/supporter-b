import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PgliteDB } from "@/lib/db/client-pglite";
import {
  agentClients, agentConnections, agentEvents, agentObservations, agentRequests, users,
} from "@/lib/db/schema";
import { agentAnalyticsEnvironment, agentErrorCode, type AgentObservation } from "@/lib/analytics/agent-contract";
import { logger } from "@/lib/observability/logger";
import { setupServerTestEnv, teardownServerTestEnv } from "@/lib/server/__tests__/_harness";
import { seedUser, seedBuyerWorkspace } from "@/lib/server/repositories/drizzle/__tests__/_seed";
import { DrizzleAgentAnalyticsRepository } from "@/lib/server/repositories/drizzle/agent-analytics";
import {
  __resetAgentAnalyticsForTest, agentAnalyticsReport, recordAgentObservation,
  pruneAgentObservations, MAX_AGENT_OBSERVATIONS_PER_MINUTE,
} from "../agent-analytics";

vi.mock("@/lib/observability/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

let db: PgliteDB;
const from = new Date("2026-11-01T00:00:00Z");
const to = new Date("2026-11-08T00:00:00Z");
const during = new Date("2026-11-02T16:00:00Z");
const base: AgentObservation = { surface: "public_mcp", operation: "catalog", outcome: "ok", durationMs: 12.4 };
beforeEach(async () => {
  vi.stubEnv("AGENT_ANALYTICS_ENABLED", "true");
  vi.stubEnv("AGENT_ANALYTICS_ENVIRONMENT", "production");
  __resetAgentAnalyticsForTest();
  vi.clearAllMocks();
  db = await setupServerTestEnv();
});
afterEach(() => {
  teardownServerTestEnv();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function seedConnection() {
  const user = await seedUser(db, { email: `private-${randomUUID()}@example.com` });
  const workspace = await seedBuyerWorkspace(db, { name: "비공개 고객 이름" });
  const clientId = randomUUID();
  const id = randomUUID();
  await db.insert(agentClients).values({ id: clientId, name: "Untrusted client name", redirectUris: ["http://localhost/callback"], expiresAt: new Date("2027-01-01Z") });
  await db.insert(agentConnections).values({ id, clientId, userId: user.id, workspaceId: workspace.id, sessionVersion: 0, scopes: ["requests:read", "requests:write"], expiresAt: new Date("2027-01-01Z") });
  return { id, user };
}
async function event(connectionId: string, name: typeof agentEvents.$inferInsert.event, at = during, environment: typeof agentEvents.$inferInsert.environment = "production", requestId?: string) {
  await db.insert(agentEvents).values({ id: randomUUID(), connectionId, event: name, createdAt: at, environment, requestId });
}
async function observation(overrides: Partial<typeof agentObservations.$inferInsert> = {}) {
  const row: typeof agentObservations.$inferInsert = {
    id: randomUUID(), environment: "production", occurredAt: during,
    surface: "public_mcp", operation: "catalog", outcome: "ok", durationMs: 10, ...overrides,
  };
  await new DrizzleAgentAnalyticsRepository(db).record(row);
  return row;
}

describe("bounded observation storage", () => {
  it("persists only finite structured fields and keeps join IDs out of operational logs", async () => {
    const connection = await seedConnection();
    const requestId = randomUUID();
    await db.insert(agentRequests).values({ id: requestId, connectionId: connection.id, requestKey: randomUUID(), content: { title: "고객 원문" } });
    await recordAgentObservation({ ...base, surface: "account_mcp", operation: "prepare_request", connectionId: connection.id, requestId, missingRules: ["pg", "pg", "title"], contractType: "new" });
    const [stored] = await db.select().from(agentObservations);
    expect(stored).toMatchObject({ environment: "production", connectionId: connection.id, requestId, durationMs: 12, dimensions: { missingRules: ["pg", "title"], contractType: "new" } });
    const logged = JSON.stringify(vi.mocked(logger.info).mock.calls);
    for (const secret of [connection.id, requestId, connection.user.email, "고객 원문", "비공개 고객 이름", "Untrusted client name"]) expect(logged).not.toContain(secret);
  });

  it("rejects arbitrary metadata, unknown codes, nonfinite numbers, and orphan request identifiers", async () => {
    const invalid = [
      { ...base, email: "private@example.com" },
      { ...base, durationMs: Infinity },
      { ...base, durationMs: -1 },
      { ...base, durationMs: 3_600_001 },
      { ...base, operation: "secret token" },
      { ...base, errorCode: "error containing private@example.com" },
      { ...base, missingRules: ["homepage-value"] },
      { ...base, requestId: randomUUID() },
      { ...base, candidateCount: 101 },
    ];
    for (const input of invalid) await recordAgentObservation(input as AgentObservation);
    expect(await db.select().from(agentObservations)).toHaveLength(0);
    expect(logger.info).not.toHaveBeenCalled();
    expect(agentErrorCode("private@example.com")).toBe("other");
  });

  it("separates database and log failures and opens a short database circuit after failure", async () => {
    vi.mocked(logger.info).mockImplementationOnce(() => { throw new Error("log failure"); });
    await expect(recordAgentObservation(base)).resolves.toBeUndefined();
    expect(await db.select().from(agentObservations)).toHaveLength(1);
    const record = vi.spyOn(DrizzleAgentAnalyticsRepository.prototype, "record").mockRejectedValue(new Error("private database failure"));
    await expect(recordAgentObservation(base)).resolves.toBeUndefined();
    await expect(recordAgentObservation(base)).resolves.toBeUndefined();
    expect(record).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("private database failure");
  });

  it("keeps the disabled database sink untouched and bounds log volume", async () => {
    vi.stubEnv("AGENT_ANALYTICS_ENABLED", "false");
    const record = vi.spyOn(DrizzleAgentAnalyticsRepository.prototype, "record");
    const time = vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    for (let i = 0; i < MAX_AGENT_OBSERVATIONS_PER_MINUTE + 2; i++) await recordAgentObservation(base);
    expect(logger.info).toHaveBeenCalledTimes(MAX_AGENT_OBSERVATIONS_PER_MINUTE);
    expect(record).not.toHaveBeenCalled();
    time.mockReturnValue(2_060_000);
    await recordAgentObservation(base);
    expect(logger.info).toHaveBeenCalledTimes(MAX_AGENT_OBSERVATIONS_PER_MINUTE + 1);
  });

  it("releases callers after 750ms without freeing pending write slots or retrying timed-out writes", async () => {
    vi.useFakeTimers();
    const finish: (() => void)[] = [];
    const record = vi.spyOn(DrizzleAgentAnalyticsRepository.prototype, "record").mockImplementation(() =>
      new Promise<void>(resolve => { finish.push(resolve); }),
    );
    let returned = 0;
    const pending = Array.from({ length: 8 }, () => recordAgentObservation(base).then(() => { returned++; }));
    await vi.advanceTimersByTimeAsync(0);
    expect(record).toHaveBeenCalledTimes(8);
    await vi.advanceTimersByTimeAsync(749);
    expect(returned).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all(pending);
    expect(returned).toBe(8);

    // Even after the circuit reopens, all eight database writes still own slots.
    await vi.advanceTimersByTimeAsync(30_001);
    await recordAgentObservation(base);
    expect(record).toHaveBeenCalledTimes(8);
    finish[0]();
    await vi.advanceTimersByTimeAsync(0);
    const next = recordAgentObservation(base);
    await vi.advanceTimersByTimeAsync(0);
    expect(record).toHaveBeenCalledTimes(9);
    finish.slice(1).forEach(resolve => resolve());
    await next;
    expect(record).toHaveBeenCalledTimes(9);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not infer production traffic from NODE_ENV or an unrecognized environment", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AGENT_ANALYTICS_ENVIRONMENT", "private-free-text");
    expect(agentAnalyticsEnvironment()).toBe("unknown");
    vi.stubEnv("AGENT_ANALYTICS_ENVIRONMENT", "staging");
    expect(agentAnalyticsEnvironment()).toBe("staging");
  });

  it("ignores duplicate event IDs while preserving independent calls", async () => {
    const row = await observation();
    const repo = new DrizzleAgentAnalyticsRepository(db);
    await repo.record(row);
    await observation();
    expect(await db.select().from(agentObservations)).toHaveLength(2);
  });
});

describe("aggregate reports", () => {
  it("keeps consent distinct from token issuance, removes duplicate conversions, and isolates environment", async () => {
    const consentOnly = await seedConnection();
    const active = await seedConnection();
    const boundary = await seedConnection();
    const staging = await seedConnection();
    await event(consentOnly.id, "connected");
    await event(active.id, "connected");
    await event(active.id, "connected");
    await event(active.id, "token_issued");
    await event(active.id, "token_issued");
    await event(active.id, "token_refreshed");
    await event(active.id, "draft_created");
    await event(active.id, "request_submitted");
    await event(active.id, "request_submitted");
    await event(boundary.id, "connected", to);
    await event(staging.id, "connected", during, "staging");
    await observation({ connectionId: active.id, surface: "account_mcp", operation: "get_connection" });
    await observation({ connectionId: active.id, surface: "account_mcp", operation: "get_connection" });
    const report = await agentAnalyticsReport({ from, to, environment: "production" });
    expect(report.funnel).toEqual({ consents: 2, tokens_issued: 1, tool_users_observed: 1, connections_with_drafts: 1, connections_with_submissions: 1 });
    expect(report.unmeasured).not.toContain("provider_contracts");
    expect(report.outcomes.provider_contracts).toBe(0);
    expect(report.commissions).toEqual([]);
    const output = JSON.stringify(report);
    for (const connection of [consentOnly, active, boundary, staging]) {
      expect(output).not.toContain(connection.id);
      expect(output).not.toContain(connection.user.email);
    }
    const again = await agentAnalyticsReport({ from, to, environment: "production" });
    expect(again.funnel).toEqual(report.funnel);
    expect(await db.select().from(agentEvents)).toHaveLength(11);
  });

  it("counts request cohorts and pending work as of the exclusive end boundary", async () => {
    const connection = await seedConnection();
    const beforeEnd = new Date("2026-11-03T16:00:00Z");
    for (const [contractType, createdAt, submittedAt] of [
      ["new", during, beforeEnd], ["new", during, null], ["new", during, to],
      ["renewal", to, null],
    ] as const) {
      const id = randomUUID();
      await db.insert(agentRequests).values({ id, connectionId: connection.id, requestKey: randomUUID(), content: { contractType, title: "private draft answer" }, createdAt, submittedAt });
      await event(connection.id, "draft_created", createdAt, "production", id);
      await event(connection.id, "draft_created", createdAt, "production", id);
    }
    const report = await agentAnalyticsReport({ from, to, environment: "production" });
    expect(report.requests).toEqual([{ contract_type: "new", drafts: 3, submitted: 1, pending: 2, average_seconds_to_submit: 86400 }]);
    expect(JSON.stringify(report)).not.toContain("private draft answer");
  });

  it("uses KST calendar dates and counts protocol errors even when grouped beside successful calls", async () => {
    await observation({ occurredAt: from, durationMs: 20 });
    await observation({ occurredAt: during, surface: "account_mcp", operation: "prepare_request", outcome: "invalid_request", errorCode: "invalid_request", dimensions: { missingRules: ["pg", "title"] }, durationMs: 100 });
    await observation({ occurredAt: to });
    await observation({ environment: "test" });
    const report = await agentAnalyticsReport({ from, to, environment: "production" });
    expect(report.coverage.observations).toBe(2);
    expect(report.activity).toHaveLength(2);
    expect(report.activity[1]).toMatchObject({ day: "2026-11-03", operation: "prepare_request", outcome: "invalid_request", calls: 1, average_ms: 100, p95_ms: 100 });
    expect(report.missing).toEqual([{ rule: "pg", observations: 1 }, { rule: "title", observations: 1 }]);
  });

  it("rejects inverted or unbounded report ranges before querying", async () => {
    const report = vi.spyOn(DrizzleAgentAnalyticsRepository.prototype, "report");
    await expect(agentAnalyticsReport({ from: to, to: from, environment: "production" })).rejects.toThrow();
    await expect(agentAnalyticsReport({ from, to: new Date("2027-03-01Z"), environment: "production" })).rejects.toThrow();
    expect(report).not.toHaveBeenCalled();
  });
});

describe("retention and ownership", () => {
  it("previews without deletion, deletes only expired observations, and preserves the business ledger", async () => {
    const connection = await seedConnection();
    await event(connection.id, "connected");
    await observation({ connectionId: connection.id, occurredAt: new Date("2026-10-01Z") });
    await observation({ connectionId: connection.id, occurredAt: new Date("2026-10-09Z") });
    const now = new Date("2026-11-08T00:00:00Z");
    expect(await pruneAgentObservations(false, now)).toMatchObject({ execute: false, count: 1 });
    expect(await db.select().from(agentObservations)).toHaveLength(2);
    expect(await pruneAgentObservations(true, now)).toMatchObject({ execute: true, count: 1, batchLimit: 5000 });
    expect(await db.select().from(agentObservations)).toHaveLength(1);
    expect(await db.select().from(agentEvents)).toHaveLength(1);
  });

  it("caps a deletion batch at 5000 rows", async () => {
    await db.execute(sql`INSERT INTO agent_observations(id, environment, occurred_at, surface, operation, outcome, duration_ms)
      SELECT md5('retention-test-' || n::text)::uuid, 'test', '2026-01-01'::timestamptz, 'public_mcp', 'catalog', 'ok', 1 FROM generate_series(1, 5001) n`);
    expect(await pruneAgentObservations(true, new Date("2026-11-08Z"))).toMatchObject({ count: 5000 });
    expect(await db.select().from(agentObservations)).toHaveLength(1);
  });

  it("cascades linked observations when the user is removed, preserving anonymous observations", async () => {
    const connection = await seedConnection();
    await observation({ connectionId: connection.id });
    await observation();
    await db.delete(users).where(eq(users.id, connection.user.id));
    const remaining = await db.select().from(agentObservations);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].connectionId).toBeNull();
  });
});
