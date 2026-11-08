import { randomUUID, createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  seedRfp,
} from "@/lib/server/repositories/drizzle/__tests__/_seed";
import type { PgliteDB } from "@/lib/db/client-pglite";
import {
  agentCodes,
  agentConnections,
  agentEvents,
  agentTokens,
  agentRequests,
  bids,
  contracts,
  rfpInvitations,
  rfps,
  users,
  workspaceMembers,
  workspaces,
} from "@/lib/db/schema";
import { agentAccountUrls } from "@/lib/server/agent/account-contract";
import {
  registerAgentClient,
  authorizeAgent,
  exchangeAgentToken,
  authenticateAgent,
  revokeAgentConnection,
} from "../agent-account";
import { prepareAgentRequest, readAgentRequest } from "../agent-request";
import { recordPartnerOutcome } from "../partner-outcomes";
import type { PartnerOutcomeOperator } from "@/lib/agent/partner-outcomes";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  POST as mcpPost,
  GET as mcpGet,
} from "@/app/api/agent/account/mcp/route";
import { POST as tokenPost } from "@/app/api/agent/oauth/token/route";
import { GET as metadataGet } from "@/app/.well-known/oauth-protected-resource/api/agent/account/mcp/route";
import { __resetPublicAgentBudgetForTest } from "@/lib/server/agent/public-guard";
import { DrizzleAgentRepository } from "@/lib/server/repositories/drizzle/agent";

import { recordAgentObservation } from "../agent-analytics";
vi.mock("../agent-analytics", () => ({
  recordAgentObservation: vi.fn().mockResolvedValue(undefined),
}));

let db: PgliteDB;
let actor: { userId: string; workspaceId: string };
const verifier = "v".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("base64url");
beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_BUYER_ORIGIN", "https://support-b.test");
  vi.stubEnv("NEXT_PUBLIC_PARTNER_ORIGIN", "https://partner.support-b.test");
  vi.stubEnv("AGENT_ACCOUNT_CHANNEL_ENABLED", "true");
  __resetPublicAgentBudgetForTest();
  vi.mocked(recordAgentObservation).mockReset().mockResolvedValue(undefined);
  db = await setupServerTestEnv();
  const user = await seedUser(db);
  const workspace = await seedBuyerWorkspace(db);
  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, user.id));
  await seedMembership(db, workspace.id, user.id);
  actor = { userId: user.id, workspaceId: workspace.id };
});

describe("protected HTTP and MCP", () => {
  it("advertises canonical resource metadata and challenges anonymous clients", async () => {
    const response = await mcpGet(new Request(agentAccountUrls().resource));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      agentAccountUrls().metadata,
    );
    expect(
      await (
        await metadataGet(new Request(agentAccountUrls().metadata))
      ).json(),
    ).toMatchObject({
      resource: agentAccountUrls().resource,
      authorization_servers: ["https://support-b.test"],
      bearer_methods_supported: ["header"],
    });
    vi.stubEnv("AGENT_ACCOUNT_CHANNEL_ENABLED", "false");
    expect(
      (await mcpGet(new Request(agentAccountUrls().resource))).status,
    ).toBe(404);
  });
  it("exchanges a form request over HTTP and rejects duplicate resource parameters", async () => {
    const { query } = await authorization();
    const code = new URL(
      await authorizeAgent(query, actor, true),
    ).searchParams.get("code")!;
    const fields = {
      grant_type: "authorization_code",
      client_id: query.client_id,
      resource: query.resource,
      code,
      redirect_uri: query.redirect_uri,
      code_verifier: verifier,
    };
    const request = (body: string) =>
      new Request(agentAccountUrls().token, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
    const duplicate = await tokenPost(
      request(`${new URLSearchParams(fields)}&resource=https://attacker.test`),
    );
    expect(duplicate.status).toBe(400);
    const response = await tokenPost(
      request(new URLSearchParams(fields).toString()),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const token = await response.json();
    expect(
      (await authenticateAgent(token.access_token)).connection.userId,
    ).toBe(actor.userId);
  });
  it.each(["auto", "legacy"] as const)(
    "supports the official MCP client (%s), draft round-trip and revocation",
    async (mode) => {
      const { token } = await connect();
      const transport = new StreamableHTTPClientTransport(
        new URL(agentAccountUrls().resource),
        {
          requestInit: { headers: { authorization: `Bearer ${token}` } },
          fetch: async (input, init) => {
            const request = new Request(input, init);
            expect(request.url).toBe(agentAccountUrls().resource);
            return request.method === "POST"
              ? mcpPost(request)
              : mcpGet(request);
          },
        },
      );
      const client = new Client(
        { name: "test-client", version: "1" },
        { versionNegotiation: { mode } },
      );
      try {
        await client.connect(transport);
        expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
          "get_connection",
          "recommend_pg",
          "prepare_request",
          "get_request_status",
        ]);
        const created = await client.callTool({
          name: "prepare_request",
          arguments: {
            requestKey: randomUUID(),
            content: { title: "PG 상담" },
          },
        });
        expect(created.isError).not.toBe(true);
        const text = created.content[0];
        const draft = text.type === "text" ? JSON.parse(text.text) : null;
        const read = await client.callTool({
          name: "get_request_status",
          arguments: { requestId: draft.requestId },
        });
        expect(read.isError).not.toBe(true);
        const principal = await authenticateAgent(token);
        await revokeAgentConnection(principal.connection.id, actor);
        await expect(client.listTools()).rejects.toThrow();
      } finally {
        await client.close();
      }
    },
  );
  it("returns a scope challenge before a read-only client can prepare a draft", async () => {
    const { token } = await connect("requests:read");
    const response = await mcpPost(
      new Request(agentAccountUrls().resource, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "prepare_request",
            arguments: { requestKey: randomUUID(), content: {} },
          },
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain(
      "requests:write",
    );
  });
  it("returns only verified contract and integration projections through MCP and rejects another connection", async () => {
    const { token } = await connect();
    const draft = await prepareAgentRequest(token, {
      requestKey: randomUUID(),
      content: { title: "PG 상담" },
    });
    const pg = await seedPgWorkspace(db, "Selected test PG");
    const rfp = await seedRfp(db, {
      buyerWsId: actor.workspaceId,
      createdBy: actor.userId,
    });
    const submittedAt = new Date(Date.now() - 60_000);
    const invitationId = randomUUID();
    const bidId = randomUUID();
    await db
      .insert(rfpInvitations)
      .values({
        id: invitationId,
        rfpId: rfp.id,
        pgWsId: pg.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      });
    await db
      .insert(bids)
      .values({
        id: bidId,
        rfpId: rfp.id,
        pgWsId: pg.id,
        invitationId,
        settleCycle: "D+1",
        submittedBy: actor.userId,
      });
    await db
      .update(rfps)
      .set({ status: "awarded", awardedBidId: bidId, sentAt: submittedAt })
      .where(eq(rfps.id, rfp.id));
    await db
      .insert(contracts)
      .values({
        rfpId: rfp.id,
        bidId,
        awardedBy: actor.userId,
        awardedAt: submittedAt,
      });
    await db
      .update(agentRequests)
      .set({ rfpCode: rfp.code, submittedAt })
      .where(eq(agentRequests.id, draft.requestId));
    const operator: PartnerOutcomeOperator = {
      channel: "operator_cli",
      label: "private-operator@example.test",
    };
    const common = {
      requestId: draft.requestId,
      providerWorkspaceId: pg.id,
      evidenceReference: "private/evidence-sentinel",
      source: "operator_evidence",
      occurredAt: new Date(Date.now() - 30_000).toISOString(),
    };
    const toolClient = async (accessToken: string) => {
      const client = new Client({ name: "projection-test", version: "1" });
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL(agentAccountUrls().resource),
          {
            requestInit: {
              headers: { authorization: `Bearer ${accessToken}` },
            },
            fetch: async (input, init) => {
              const request = new Request(input, init);
              return request.method === "POST"
                ? mcpPost(request)
                : mcpGet(request);
            },
          },
        ),
      );
      return client;
    };
    const client = await toolClient(token);
    const foreign = await connect("requests:read");
    const foreignClient = await toolClient(foreign.token);
    const read = async () => {
      const result = await client.callTool({
        name: "get_request_status",
        arguments: { requestId: draft.requestId },
      });
      expect(result.isError).not.toBe(true);
      const text = result.content[0];
      if (text.type !== "text") throw new Error("expected JSON MCP result");
      return JSON.parse(text.text);
    };
    try {
      expect(await read()).toMatchObject({
        providerContractStatus: "not_verified",
        integration: {
          sandbox: { status: "not_verified" },
          live: { status: "not_verified" },
        },
      });
      const contract = await recordPartnerOutcome(
        {
          ...common,
          kind: "provider_contract_confirmed",
          commandId: randomUUID(),
          reference: "private/provider-contract-sentinel",
        },
        operator,
      );
      await recordPartnerOutcome(
        {
          ...common,
          kind: "integration_verified",
          commandId: randomUUID(),
          reference: "private/sandbox-sentinel",
          source: "test_result",
          integrationEnvironment: "sandbox",
        },
        operator,
      );
      await recordPartnerOutcome(
        {
          ...common,
          kind: "integration_verified",
          commandId: randomUUID(),
          reference: "private/live-sentinel",
          source: "customer_report",
          integrationEnvironment: "live",
        },
        operator,
      );
      const commission = await recordPartnerOutcome(
        {
          ...common,
          kind: "commission_confirmed",
          commandId: randomUUID(),
          reference: "private/commission-sentinel",
          amount: "9876543.2100",
          currency: "KRW",
          agreementReference: "private/agreement-sentinel",
          calculationReference: "private/calculation-sentinel",
        },
        operator,
      );
      await recordPartnerOutcome(
        {
          ...common,
          kind: "commission_paid",
          commandId: randomUUID(),
          reference: "private/payment-sentinel",
          relatedEntryId: commission.entry.id,
          amount: "9876543.2100",
          currency: "KRW",
        },
        operator,
      );
      const status = await read();
      expect(status.providerContractStatus).toBe("confirmed");
      expect(status.providerContract).toEqual({
        status: "confirmed",
        source: "operator_evidence",
        occurredAt: common.occurredAt,
        recordedAt: expect.any(String),
      });
      expect(status.integration).toEqual({
        sandbox: {
          status: "verified",
          source: "test_result",
          environment: "sandbox",
          occurredAt: common.occurredAt,
          recordedAt: expect.any(String),
        },
        live: {
          status: "reported",
          source: "customer_report",
          environment: "live",
          occurredAt: common.occurredAt,
          recordedAt: expect.any(String),
        },
      });
      const serialized = JSON.stringify(status);
      for (const value of [
        "private/",
        operator.label,
        "9876543.2100",
        "KRW",
        contract.entry.id,
        commission.entry.id,
        "evidenceReference",
        "agreementReference",
        "calculationReference",
        "inputHash",
        "commission",
        "operatorLabel",
      ])
        expect(serialized).not.toContain(value);
      await expect(
        readAgentRequest(
          await authenticateAgent(foreign.token),
          draft.requestId,
        ),
      ).rejects.toMatchObject({ code: "not_found", status: 404 });
      const denied = await foreignClient.callTool({
        name: "get_request_status",
        arguments: { requestId: draft.requestId },
      });
      expect(denied.isError).toBe(true);
      expect(denied.content).toEqual([
        { type: "text", text: JSON.stringify({ error: "not_found" }) },
      ]);
    } finally {
      await client.close();
      await foreignClient.close();
    }
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  teardownServerTestEnv();
  vi.unstubAllEnvs();
});

async function authorization(scope = "requests:read requests:write") {
  const client = await registerAgentClient({
    client_name: "Test agent",
    redirect_uris: ["http://127.0.0.1:54321/callback"],
  });
  const query = {
    client_id: client.client_id,
    response_type: "code",
    redirect_uri: client.redirect_uris[0],
    resource: agentAccountUrls().resource,
    scope,
    state: "client-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
  };
  return { client, query };
}
async function connect(scope?: string) {
  const { query } = await authorization(scope);
  const redirect = new URL(await authorizeAgent(query, actor, true));
  const input = {
    grant_type: "authorization_code",
    client_id: query.client_id,
    resource: query.resource,
    redirect_uri: query.redirect_uri,
    code: redirect.searchParams.get("code")!,
    code_verifier: verifier,
  };
  const result = await exchangeAgentToken(input);
  expect(result.status).toBe(200);
  return {
    input,
    token: result.body.access_token as string,
    refresh: result.body.refresh_token as string,
    body: result.body,
  };
}

function tokenRequest(fields: Record<string, string>) {
  return tokenPost(
    new Request(agentAccountUrls().token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    }),
  );
}

function toolRequest(
  token: string,
  name: string,
  args: Record<string, unknown>,
) {
  return new Request(agentAccountUrls().resource, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}

describe("account observations", () => {
  it("records anonymous authentication failure once without supplied identifiers or content", async () => {
    const foreignId = randomUUID();
    const response = await mcpPost(
      toolRequest("bad-secret-sentinel", "get_request_status", {
        requestId: foreignId,
        prompt: "private-prompt-sentinel",
      }),
    );
    expect(response.status).toBe(401);
    expect(recordAgentObservation).toHaveBeenCalledTimes(1);
    const observation = vi.mocked(recordAgentObservation).mock.calls[0][0];
    expect(observation).toMatchObject({
      surface: "account_mcp",
      operation: "unknown",
      outcome: "rejected",
      errorCode: "invalid_token",
    });
    expect(observation).not.toHaveProperty("connectionId");
    expect(observation).not.toHaveProperty("requestId");
    expect(JSON.stringify(observation)).not.toMatch(/sentinel/);
    expect(JSON.stringify(observation)).not.toContain(foreignId);
  });
  it("observes HTTP-200 SDK validation errors without arguments or error messages", async () => {
    const { token } = await connect();
    vi.mocked(recordAgentObservation).mockClear();
    const response = await mcpPost(
      toolRequest(token, "get_connection", {
        privateField: "private-value-sentinel",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"isError":true');
    expect(recordAgentObservation).toHaveBeenCalledTimes(1);
    const observation = vi.mocked(recordAgentObservation).mock.calls[0][0];
    expect(observation).toMatchObject({
      operation: "get_connection",
      outcome: "invalid_request",
      errorCode: "invalid_request",
      connectionId: expect.any(String),
    });
    expect(JSON.stringify(observation)).not.toMatch(/privateField|sentinel/);
  });
  it("records a tool-level ownership denial without attributing the foreign request", async () => {
    const { token } = await connect();
    vi.mocked(recordAgentObservation).mockClear();
    const foreignId = randomUUID();
    const response = await mcpPost(
      toolRequest(token, "get_request_status", { requestId: foreignId }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"isError":true');
    expect(recordAgentObservation).toHaveBeenCalledTimes(1);
    const observation = vi.mocked(recordAgentObservation).mock.calls[0][0];
    expect(observation).toMatchObject({
      operation: "get_request_status",
      outcome: "rejected",
      errorCode: "not_found",
    });
    expect(observation).not.toHaveProperty("requestId");
    expect(JSON.stringify(observation)).not.toContain(foreignId);
  });
  it("projects only verified draft identifiers and finite missing-rule metadata", async () => {
    const { token } = await connect();
    vi.mocked(recordAgentObservation).mockClear();
    const response = await mcpPost(
      toolRequest(token, "prepare_request", {
        requestKey: randomUUID(),
        content: { title: "private-title-sentinel", contractType: "new" },
      }),
    );
    expect(response.status).toBe(200);
    expect(recordAgentObservation).toHaveBeenCalledTimes(1);
    const observation = vi.mocked(recordAgentObservation).mock.calls[0][0];
    expect(observation).toMatchObject({
      operation: "prepare_request",
      outcome: "ok",
      connectionId: expect.any(String),
      requestId: expect.any(String),
      contractType: "new",
      missingRules: expect.arrayContaining(["website-required", "pg"]),
    });
    expect(JSON.stringify(observation)).not.toMatch(/sentinel/);
  });
  it("keeps OAuth and MCP successful when the observation sink rejects", async () => {
    vi.mocked(recordAgentObservation).mockRejectedValue(
      new Error("observation sink unavailable"),
    );
    const { token } = await connect();
    const response = await mcpPost(toolRequest(token, "get_connection", {}));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('"isError":true');
  });
  it("distinguishes consent denial, consent alone and initial token issuance", async () => {
    const { query } = await authorization();
    await authorizeAgent(query, actor, false);
    expect(recordAgentObservation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        surface: "browser",
        operation: "authorize",
        outcome: "denied",
      }),
    );
    expect(await db.select().from(agentEvents)).toHaveLength(0);
    const url = new URL(await authorizeAgent(query, actor, true));
    expect(
      (await db.select().from(agentEvents)).map((event) => event.event),
    ).toEqual(["connected"]);
    const response = await tokenRequest({
      grant_type: "authorization_code",
      client_id: query.client_id,
      resource: query.resource,
      code: url.searchParams.get("code")!,
      redirect_uri: query.redirect_uri,
      code_verifier: verifier,
    });
    expect(response.status).toBe(200);
    expect(
      (await db.select().from(agentEvents)).map((event) => event.event),
    ).toEqual(["connected", "token_issued"]);
    expect(recordAgentObservation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        surface: "oauth",
        operation: "token",
        outcome: "ok",
        connectionId: expect.any(String),
      }),
    );
  });
});

describe("OAuth delegation", () => {
  it("rolls back initial token issuance if its lifecycle event cannot be stored", async () => {
    const { query } = await authorization();
    const redirect = new URL(await authorizeAgent(query, actor, true));
    const fields = {
      grant_type: "authorization_code",
      client_id: query.client_id,
      resource: query.resource,
      code: redirect.searchParams.get("code")!,
      redirect_uri: query.redirect_uri,
      code_verifier: verifier,
    };
    const event = DrizzleAgentRepository.prototype.event;
    const failure = vi
      .spyOn(DrizzleAgentRepository.prototype, "event")
      .mockImplementationOnce(async function (
        this: DrizzleAgentRepository,
        input,
      ) {
        if (input.event === "token_issued")
          throw new Error("storage unavailable");
        return event.call(this, input);
      });
    expect((await tokenRequest(fields)).status).toBe(503);
    expect(await db.select().from(agentTokens)).toHaveLength(0);
    expect((await db.select().from(agentCodes))[0].usedAt).toBeNull();
    expect(
      (await db.select().from(agentEvents)).map((entry) => entry.event),
    ).toEqual(["connected"]);
    failure.mockRestore();
    expect((await tokenRequest(fields)).status).toBe(200);
    expect(await db.select().from(agentTokens)).toHaveLength(1);
    expect(
      (await db.select().from(agentEvents)).map((entry) => entry.event),
    ).toEqual(["connected", "token_issued"]);
  });
  it("issues PKCE-bound, hashed credentials and immutable workspace scopes", async () => {
    const { token, refresh } = await connect();
    const principal = await authenticateAgent(token);
    expect(principal.connection).toMatchObject(actor);
    expect(principal.scopes).toEqual(["requests:read", "requests:write"]);
    const stored = JSON.stringify(await db.select().from(agentTokens));
    expect(stored).not.toContain(token);
    expect(stored).not.toContain(refresh);
    expect(await db.select().from(agentEvents)).toMatchObject([
      { event: "connected" },
      { event: "token_issued" },
    ]);
  });
  it("rejects redirect changes, plain PKCE and a different resource before consent", async () => {
    const { query } = await authorization();
    for (const changed of [
      { redirect_uri: "https://attacker.test" },
      { code_challenge_method: "plain" },
      { resource: "https://attacker.test/mcp" },
    ]) {
      await expect(
        authorizeAgent({ ...query, ...changed }, actor, true),
      ).rejects.toThrow();
    }
    expect(await db.select().from(agentConnections)).toHaveLength(0);
  });
  it("returns denial only to a validated callback and echoes state and issuer", async () => {
    const { query } = await authorization();
    const url = new URL(await authorizeAgent(query, actor, false));
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("client-state");
    expect(url.searchParams.get("iss")).toBe("https://support-b.test");
    expect(await db.select().from(agentConnections)).toHaveLength(0);
  });
  it("consumes a code on invalid PKCE and refuses subsequent use", async () => {
    const { query } = await authorization();
    const code = new URL(
      await authorizeAgent(query, actor, true),
    ).searchParams.get("code");
    const input = {
      grant_type: "authorization_code",
      client_id: query.client_id,
      resource: query.resource,
      redirect_uri: query.redirect_uri,
      code,
      code_verifier: "x".repeat(64),
    };
    expect((await exchangeAgentToken(input)).body.error).toBe("invalid_grant");
    expect(
      (await exchangeAgentToken({ ...input, code_verifier: verifier })).status,
    ).toBe(400);
    expect((await db.select().from(agentCodes))[0].usedAt).not.toBeNull();
    expect(await db.select().from(agentTokens)).toHaveLength(0);
  });
  it("does not exchange a code twice or for another resource/client", async () => {
    const { input } = await connect();
    expect((await exchangeAgentToken(input)).status).toBe(400);
    await expect(
      exchangeAgentToken({ ...input, resource: "https://different.test" }),
    ).rejects.toMatchObject({ code: "invalid_target" });
    const { client } = await authorization();
    expect(
      (await exchangeAgentToken({ ...input, client_id: client.client_id }))
        .status,
    ).toBe(400);
  });
  it("rotates refresh tokens and revokes the grant on reuse", async () => {
    const { input, token, refresh } = await connect();
    const request = {
      grant_type: "refresh_token",
      client_id: input.client_id,
      resource: input.resource,
      refresh_token: refresh,
    };
    const rotated = await exchangeAgentToken(request);
    expect(rotated.status).toBe(200);
    await expect(authenticateAgent(token)).rejects.toMatchObject({
      code: "invalid_token",
    });
    await authenticateAgent(rotated.body.access_token as string);
    expect((await exchangeAgentToken(request)).status).toBe(400);
    await expect(
      authenticateAgent(rotated.body.access_token as string),
    ).rejects.toMatchObject({ code: "invalid_token" });
    expect((await db.select().from(agentEvents)).map((e) => e.event)).toEqual([
      "connected",
      "token_issued",
      "token_refreshed",
      "revoked",
    ]);
  });
  it.each([
    "revoked",
    "connection_expired",
    "refresh_expired",
    "member_removed",
    "membership_unapproved",
    "workspace_inactive",
    "user_unverified",
    "session_changed",
  ] as const)(
    "returns invalid_grant over HTTP when refresh permission is %s",
    async (change) => {
      const { input, token, refresh } = await connect();
      const { connection } = await authenticateAgent(token);
      if (change === "revoked")
        await revokeAgentConnection(connection.id, actor);
      if (change === "connection_expired")
        await db
          .update(agentConnections)
          .set({ expiresAt: new Date(0) })
          .where(eq(agentConnections.id, connection.id));
      if (change === "refresh_expired")
        await db
          .update(agentTokens)
          .set({ refreshExpiresAt: new Date(0) })
          .where(eq(agentTokens.connectionId, connection.id));
      if (change === "member_removed")
        await db
          .delete(workspaceMembers)
          .where(eq(workspaceMembers.userId, actor.userId));
      if (change === "membership_unapproved")
        await db
          .update(workspaceMembers)
          .set({ approvalStatus: "rejected" })
          .where(eq(workspaceMembers.userId, actor.userId));
      if (change === "workspace_inactive")
        await db
          .update(workspaces)
          .set({ status: "suspended" })
          .where(eq(workspaces.id, actor.workspaceId));
      if (change === "user_unverified")
        await db
          .update(users)
          .set({ emailVerified: false })
          .where(eq(users.id, actor.userId));
      if (change === "session_changed")
        await db
          .update(users)
          .set({ sessionVersion: 2 })
          .where(eq(users.id, actor.userId));
      const response = await tokenRequest({
        grant_type: "refresh_token",
        client_id: input.client_id,
        resource: input.resource,
        refresh_token: refresh,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_grant" });
      expect(response.headers.get("cache-control")).toBe("no-store");
      const tokens = await db.select().from(agentTokens);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].revokedAt).toBeNull();
      expect(
        (await db.select().from(agentEvents)).some(
          (event) => event.event === "token_refreshed",
        ),
      ).toBe(false);
    },
  );
  it("returns invalid_grant when a consent grant is revoked before exchanging its code", async () => {
    const { query } = await authorization();
    const redirect = new URL(await authorizeAgent(query, actor, true));
    const [connection] = await db.select().from(agentConnections);
    await revokeAgentConnection(connection.id, actor);
    const response = await tokenRequest({
      grant_type: "authorization_code",
      client_id: query.client_id,
      resource: query.resource,
      redirect_uri: query.redirect_uri,
      code: redirect.searchParams.get("code")!,
      code_verifier: verifier,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_grant" });
    expect(await db.select().from(agentTokens)).toHaveLength(0);
  });
  it("preserves a retryable HTTP 503 and the refresh token when membership storage fails", async () => {
    const { input, refresh } = await connect();
    const memberRead = vi
      .spyOn(DrizzleAgentRepository.prototype, "member")
      .mockRejectedValueOnce(new Error("membership storage unavailable"));
    const fields = {
      grant_type: "refresh_token",
      client_id: input.client_id,
      resource: input.resource,
      refresh_token: refresh,
    };
    const response = await tokenRequest(fields);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "temporarily_unavailable" });
    expect((await db.select().from(agentTokens))[0].revokedAt).toBeNull();
    expect(
      (await db.select().from(agentEvents)).map((event) => event.event),
    ).toEqual(["connected", "token_issued"]);
    memberRead.mockRestore();
    expect((await tokenRequest(fields)).status).toBe(200);
  });
  it.each([
    "member_removed",
    "pending",
    "unverified",
    "password_reset",
    "expired",
    "revoked",
  ] as const)("denies the next request after %s", async (change) => {
    const { token } = await connect();
    const principal = await authenticateAgent(token);
    if (change === "member_removed")
      await db
        .delete(workspaceMembers)
        .where(eq(workspaceMembers.userId, actor.userId));
    if (change === "pending")
      await db
        .update(workspaces)
        .set({ status: "pending" })
        .where(eq(workspaces.id, actor.workspaceId));
    if (change === "unverified")
      await db
        .update(users)
        .set({ emailVerified: false })
        .where(eq(users.id, actor.userId));
    if (change === "password_reset")
      await db
        .update(users)
        .set({ sessionVersion: 2 })
        .where(eq(users.id, actor.userId));
    if (change === "expired")
      await db.update(agentTokens).set({ accessExpiresAt: new Date(0) });
    if (change === "revoked")
      await revokeAgentConnection(principal.connection.id, actor);
    await expect(authenticateAgent(token)).rejects.toMatchObject({
      code: "invalid_token",
    });
  });
  it("does not authorize a PG workspace or unapproved membership", async () => {
    const { query } = await authorization();
    const pg = await seedPgWorkspace(db, "PG");
    await seedMembership(db, pg.id, actor.userId);
    await expect(
      authorizeAgent(query, { ...actor, workspaceId: pg.id }, true),
    ).rejects.toMatchObject({ code: "access_denied" });
    await db
      .update(workspaceMembers)
      .set({ approvalStatus: "rejected" })
      .where(eq(workspaceMembers.workspaceId, actor.workspaceId));
    await expect(authorizeAgent(query, actor, true)).rejects.toThrow();
  });
});

describe("delegated draft scope and revision", () => {
  it("deduplicates retries and refuses stale changes without losing the saved draft", async () => {
    const { token } = await connect();
    const input = {
      requestKey: randomUUID(),
      content: { title: "카드 결제 도입", contractType: "new" },
    };
    const first = await prepareAgentRequest(token, input);
    expect(await prepareAgentRequest(token, input)).toEqual(first);
    const changed = await prepareAgentRequest(token, {
      ...input,
      requestId: first.requestId,
      expectedRevision: 1,
      content: { title: "새 제목" },
    });
    expect(changed.revision).toBe(2);
    await expect(
      prepareAgentRequest(token, {
        ...input,
        requestId: first.requestId,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "revision_conflict" });
    expect(
      (await readAgentRequest(await authenticateAgent(token), first.requestId))
        .content.title,
    ).toBe("새 제목");
    expect((await db.select().from(agentEvents)).map((e) => e.event)).toEqual([
      "connected",
      "token_issued",
      "draft_created",
      "draft_updated",
      "status_read",
    ]);
  });
  it("blocks writing with read scope and cross-connection draft lookup, even in the same workspace", async () => {
    const read = await connect("requests:read");
    await expect(
      prepareAgentRequest(read.token, {
        requestKey: randomUUID(),
        content: {},
      }),
    ).rejects.toMatchObject({ code: "insufficient_scope" });
    const write = await connect();
    const draft = await prepareAgentRequest(write.token, {
      requestKey: randomUUID(),
      content: {},
    });
    await expect(
      readAgentRequest(await authenticateAgent(read.token), draft.requestId),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("rejects identity, attachment and test-policy overrides without saving them", async () => {
    const { token } = await connect();
    for (const content of [
      { workspaceId: randomUUID() },
      { includeTestPg: true },
      { bizProfileMode: "none" },
      { boardVisible: true },
      { rfpAttachmentIds: [randomUUID()] },
    ]) {
      await expect(
        prepareAgentRequest(token, { requestKey: randomUUID(), content }),
      ).rejects.toMatchObject({ code: "invalid_request" });
    }
  });
});

it("rejects invalid refresh scopes without consuming the valid refresh token", async () => {
  const { input, refresh } = await connect();
  await expect(
    exchangeAgentToken({
      grant_type: "refresh_token",
      client_id: input.client_id,
      resource: input.resource,
      refresh_token: refresh,
      scope: "requests:write",
    }),
  ).rejects.toMatchObject({ code: "invalid_scope" });
  expect(
    (
      await exchangeAgentToken({
        grant_type: "refresh_token",
        client_id: input.client_id,
        resource: input.resource,
        refresh_token: refresh,
      })
    ).status,
  ).toBe(200);
});
it("normalizes new PG requests before review and preserves fields for a switching request", async () => {
  const { token } = await connect();
  const content = {
    contractType: "new",
    currentFeeRate: "3%",
    monthlyAvgPgVolume: "1000만원",
    currentFeeVisibleToPg: false,
  };
  const first = await prepareAgentRequest(token, {
    requestKey: randomUUID(),
    content,
  });
  expect(first.content.currentFeeRate).toBeUndefined();
  expect(first.content.monthlyAvgPgVolume).toBeUndefined();
  expect(first.content.currentFeeVisibleToPg).toBe(true);
  const second = await prepareAgentRequest(token, {
    requestKey: randomUUID(),
    content: { ...content, contractType: "renewal" },
  });
  expect(second.content.currentFeeRate).toBe("3%");
  expect(second.content.currentFeeVisibleToPg).toBe(false);
});
