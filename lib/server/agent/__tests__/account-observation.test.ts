import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AccountObservation } from "../account-http";
import { recordAgentObservation } from "@/lib/server/services/agent-analytics";
import { authenticateAgent } from "@/lib/server/services/agent-account";

const connectionId = "00000000-0000-4000-8000-000000000001";
const { fetchMcp, closeMcp, captured } = vi.hoisted(() => ({
  fetchMcp: vi.fn(),
  closeMcp: vi.fn(),
  captured: { observation: undefined as AccountObservation | undefined },
}));
vi.mock("@/lib/server/services/agent-analytics", () => ({
  recordAgentObservation: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/server/services/agent-account", () => ({
  authenticateAgent: vi.fn(async () => ({
    connection: { id: "00000000-0000-4000-8000-000000000001" },
  })),
}));
vi.mock("@/lib/server/agent/account-mcp", () => ({
  createAccountMcpHandler: (
    _token: string,
    observation: AccountObservation,
  ) => {
    captured.observation = observation;
    return { fetch: fetchMcp, close: closeMcp };
  },
}));

import { POST } from "@/app/api/agent/account/mcp/route";
import { __resetPublicAgentBudgetForTest } from "../public-guard";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AGENT_ACCOUNT_CHANNEL_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_BUYER_ORIGIN", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_PARTNER_ORIGIN", "http://localhost:3001");
  vi.resetAllMocks();
  vi.mocked(recordAgentObservation).mockResolvedValue(undefined);
  closeMcp.mockResolvedValue(undefined);
  captured.observation = undefined;
  __resetPublicAgentBudgetForTest();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function request() {
  return new Request("http://localhost:3000/api/agent/account/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${"a".repeat(43)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_connection", arguments: {} },
    }),
  });
}

it("returns 404 without authentication or analytics when the account channel is disabled", async () => {
  vi.stubEnv("AGENT_ACCOUNT_CHANNEL_ENABLED", "false");
  vi.stubEnv("AGENT_ANALYTICS_ENABLED", "true");
  const response = await POST(request());
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "not_found" });
  expect(authenticateAgent).not.toHaveBeenCalled();
  expect(fetchMcp).not.toHaveBeenCalled();
  expect(recordAgentObservation).not.toHaveBeenCalled();
});

it("records one timeout even when an aborted tool finishes later", async () => {
  let finish!: (response: Response) => void;
  fetchMcp.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const pending = POST(request());
  await vi.advanceTimersByTimeAsync(10_001);
  expect((await pending).status).toBe(503);
  expect(fetchMcp.mock.calls[0][0].signal.aborted).toBe(true);
  expect(closeMcp).toHaveBeenCalledOnce();
  expect(recordAgentObservation).toHaveBeenCalledExactlyOnceWith({
    surface: "account_mcp",
    operation: "get_connection",
    connectionId,
    outcome: "error",
    errorCode: "timeout",
    durationMs: expect.any(Number),
  });

  captured.observation!.requestId = "00000000-0000-4000-8000-000000000002";
  captured.observation!.errorCode = "not_found";
  captured.observation!.outcome = "rejected";
  finish(Response.json({ jsonrpc: "2.0", id: 1, result: { isError: true } }));
  await vi.advanceTimersByTimeAsync(1);
  expect(recordAgentObservation).toHaveBeenCalledTimes(1);
  const event = vi.mocked(recordAgentObservation).mock.calls[0][0];
  expect(event).toMatchObject({ outcome: "error", errorCode: "timeout" });
  expect(event).not.toHaveProperty("requestId");
});

it("records a stalled response body once without retaining the body", async () => {
  fetchMcp.mockImplementationOnce((incoming: Request) =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            incoming.signal.addEventListener(
              "abort",
              () => controller.close(),
              { once: true },
            );
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    ),
  );
  const pending = POST(request());
  await vi.advanceTimersByTimeAsync(10_001);
  expect((await pending).status).toBe(503);
  expect(recordAgentObservation).toHaveBeenCalledTimes(1);
  expect(vi.mocked(recordAgentObservation).mock.calls[0][0]).toMatchObject({
    outcome: "error",
    errorCode: "timeout",
    connectionId,
  });
});
