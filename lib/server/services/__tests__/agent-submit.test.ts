import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  setupServerTestEnv,
  teardownServerTestEnv,
} from "@/lib/server/__tests__/_harness";
import {
  seedUser,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedMembership,
} from "@/lib/server/repositories/drizzle/__tests__/_seed";
import {
  seedBusinessCalendar,
  validBusinessDeadline,
} from "@/lib/server/__tests__/_business-calendar";
import {
  agentEvents,
  agentRequests,
  pgMatchingPolicies,
  pgRecommendationGroups,
  rfps,
  rfpAllowedPg,
  users,
} from "@/lib/db/schema";
import type { PgliteDB } from "@/lib/db/client-pglite";
import {
  registerAgentClient,
  authorizeAgent,
  exchangeAgentToken,
} from "../agent-account";
import {
  prepareAgentRequest,
  submitBrowserAgentRequest,
} from "../agent-request";
import { agentAccountUrls } from "@/lib/server/agent/account-contract";
import { DrizzleAgentRepository } from "@/lib/server/repositories/drizzle/agent";

vi.mock("@/lib/server/outbox/post-commit", () => ({
  flushAfterCommit: vi.fn(),
}));
vi.mock("@/lib/server/notifications/operator-rfp", () => ({
  notifyRfpOperator: vi.fn(),
}));
vi.mock("@/lib/server/notifications/dispatch", async (original) => ({
  ...(await original<object>()),
  emitAfterCommit: vi.fn(),
}));
let db: PgliteDB;
let actor: { userId: string; workspaceId: string };
let token: string;
let input: { requestKey: string; content: Record<string, unknown> };
beforeEach(async () => {
  db = await setupServerTestEnv();
  await seedBusinessCalendar();
  const u = await seedUser(db);
  const b = await seedBuyerWorkspace(db);
  const p = await seedPgWorkspace(db, "상담 PG");
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, u.id));
  await seedMembership(db, b.id, u.id);
  actor = { userId: u.id, workspaceId: b.id };
  const group = randomUUID();
  await db
    .insert(pgRecommendationGroups)
    .values({ id: group, name: "온라인 판매" });
  await db
    .insert(pgMatchingPolicies)
    .values({
      groupId: group,
      policy: {
        risk: "white",
        candidates: [
          {
            pgWorkspaceId: p.id,
            reason: "상담 가능",
            feeMin: null,
            feeMax: null,
            feeNote: "",
          },
        ],
      },
    });
  const client = await registerAgentClient({
    redirect_uris: ["http://localhost:12345/callback"],
  });
  const verifier = "v".repeat(64);
  const query = {
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    resource: agentAccountUrls().resource,
    scope: "requests:read requests:write",
    state: "state",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
  const code = new URL(
    await authorizeAgent(query, actor, true),
  ).searchParams.get("code");
  const exchange = await exchangeAgentToken({
    grant_type: "authorization_code",
    client_id: client.client_id,
    resource: query.resource,
    code,
    redirect_uri: query.redirect_uri,
    code_verifier: verifier,
  });
  expect(exchange.status).toBe(200);
  token = exchange.body.access_token as string;
  input = {
    requestKey: randomUUID(),
    content: {
      title: "결제 도입",
      industryGroupId: group,
      deadline: validBusinessDeadline().toISOString(),
      allowedPgWorkspaceIds: [p.id],
      requiredPaymentMethods: ["card"],
      productInfo: {
        cashConvertible: false,
        maximumPrice: "under_100k",
        salesMethods: ["none"],
      },
      websiteUrl: "https://example.com",
      mainProducts: "의류",
      deliveryServicePeriod: "D+3",
      contractType: "new",
    },
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  teardownServerTestEnv();
});

it("sends one private, single-PG consultation and records linkage/event atomically on retries", async () => {
  const draft = await prepareAgentRequest(token, input);
  expect(await db.select().from(rfps)).toHaveLength(0);
  const sent = await submitBrowserAgentRequest(
    draft.requestId,
    draft.revision,
    actor,
  );
  expect(
    await submitBrowserAgentRequest(draft.requestId, draft.revision, actor),
  ).toEqual(sent);
  const rows = await db.select().from(rfps);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    code: sent.rfpCode,
    buyerWsId: actor.workspaceId,
    boardVisible: false,
    status: "sent",
  });
  expect(await db.select().from(rfpAllowedPg)).toHaveLength(1);
  expect(
    (await db.select().from(agentEvents)).filter(
      (e) => e.event === "request_submitted",
    ),
  ).toHaveLength(1);
  expect((await db.select().from(agentRequests))[0].rfpCode).toBe(sent.rfpCode);
});
it("rejects stale browser confirmation, another workspace and changed PG policy", async () => {
  const draft = await prepareAgentRequest(token, input);
  await expect(
    submitBrowserAgentRequest(draft.requestId, 2, actor),
  ).rejects.toMatchObject({ code: "revision_conflict" });
  await expect(
    submitBrowserAgentRequest(draft.requestId, 1, {
      ...actor,
      workspaceId: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "not_found" });
  await db
    .update(pgMatchingPolicies)
    .set({ policy: { risk: "black", candidates: [] } });
  await expect(
    submitBrowserAgentRequest(draft.requestId, 1, actor),
  ).rejects.toMatchObject({ code: "MATCHING_UNAVAILABLE" });
  expect(await db.select().from(rfps)).toHaveLength(0);
});
it("rolls the consultation back if its durable event cannot be saved", async () => {
  const draft = await prepareAgentRequest(token, input);
  const original = DrizzleAgentRepository.prototype.event;
  vi.spyOn(DrizzleAgentRepository.prototype, "event").mockImplementation(
    function (this: DrizzleAgentRepository, row) {
      if (row.event === "request_submitted")
        throw new Error("event storage unavailable");
      return original.call(this, row);
    },
  );
  await expect(
    submitBrowserAgentRequest(draft.requestId, 1, actor),
  ).rejects.toThrow("event storage unavailable");
  expect(await db.select().from(rfps)).toHaveLength(0);
  expect((await db.select().from(agentRequests))[0].rfpCode).toBeNull();
});
