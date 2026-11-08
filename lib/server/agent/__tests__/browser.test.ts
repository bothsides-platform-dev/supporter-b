import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  headers: new Headers(),
  member: vi.fn(),
  authorize: vi.fn(),
  inspect: vi.fn(),
  connections: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireBuyerSession: async () => ({
    user: { id: "user", workspaceId: "buyer" },
  }),
}));
vi.mock("@/lib/server/repositories/factory", () => ({
  getAgentRepo: async () => ({
    member: state.member,
    connections: state.connections,
  }),
}));
vi.mock("@/lib/server/services/agent-account", () => ({
  authorizeAgent: state.authorize,
  inspectAgentAuthorization: state.inspect,
  revokeAgentConnection: vi.fn(),
}));
vi.mock("@/lib/server/services/agent-request", () => ({
  submitBrowserAgentRequest: vi.fn(),
}));
import { agentBrowserActor, agentBrowserRecoveryUrl } from "../browser";
import { authorizeAgentAction } from "@/lib/server/actions/agent-account";
import AgentConnectionsPage from "@/app/(app)/settings/agents/page";
import AgentAuthorizePage from "@/app/(app)/agent/authorize/page";
import { renderToStaticMarkup } from "react-dom/server";

beforeEach(() => {
  vi.stubEnv("AGENT_ACCOUNT_CHANNEL_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_BUYER_ORIGIN", "https://support-b.test");
  vi.stubEnv("NEXT_PUBLIC_PARTNER_ORIGIN", "https://partner.support-b.test");
  state.headers = new Headers({
    host: "support-b.test",
    origin: "https://support-b.test",
  });
  state.member.mockReset().mockResolvedValue({ name: "구매사" });
  state.authorize.mockReset().mockResolvedValue("http://localhost/callback");
  state.inspect.mockReset();
  state.connections.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
it("shows the consent button at the configured origin", async () => {
  state.inspect.mockResolvedValue({
    query: { redirect_uri: "http://localhost:53682/callback" },
    client: { name: "Claude Code" },
    scopes: ["requests:read", "requests:write"],
  });
  const html = renderToStaticMarkup(
    await AgentAuthorizePage({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain("연결해요");
  expect(html).toContain("상담 초안 작성과 수정");
  expect(state.authorize).not.toHaveBeenCalled();
});
it("explains a remapped browser port without loading private connections or throwing a page error", async () => {
  state.headers.set("host", "support-b.test:59281");
  const page = await AgentConnectionsPage();
  const html = renderToStaticMarkup(page);
  expect(html).toContain("접속 주소가 달라요");
  expect(html).toContain("https://support-b.test");
  expect(html).toContain('href="https://support-b.test/settings/agents"');
  expect(html).toContain("support-b.test:59281");
  expect(state.member).not.toHaveBeenCalled();
  expect(state.connections).not.toHaveBeenCalled();
  expect(
    renderToStaticMarkup(
      await AgentAuthorizePage({ searchParams: Promise.resolve({}) }),
    ),
  ).toContain("접속 주소가 달라요");
  expect(state.inspect).not.toHaveBeenCalled();
});
it("keeps OAuth state and PKCE on recovery while pinning the destination to the configured origin", async () => {
  state.headers.set("host", "untrusted.test:59281");
  state.headers.set("x-forwarded-host", "attacker.test");
  const query = {
    client_id: "client",
    state: "state/+&=",
    code_challenge: "challenge",
    redirect_uri: "http://localhost:53682/callback",
    resource: "https://support-b.test/api/agent/account/mcp",
  };
  const page = await AgentAuthorizePage({
    searchParams: Promise.resolve(query),
  });
  const recovery = new URL(page.props.recoveryUrl);
  expect(recovery.origin).toBe("https://support-b.test");
  expect(recovery.pathname).toBe("/agent/authorize");
  expect(Object.fromEntries(recovery.searchParams)).toEqual(query);
  expect(state.inspect).not.toHaveBeenCalled();
  expect(state.member).not.toHaveBeenCalled();
  expect(state.authorize).not.toHaveBeenCalled();
  await expect(agentBrowserActor(true)).rejects.toMatchObject({
    code: "wrong_origin",
  });
});
it("does not repair duplicate authorization parameters into a valid request during recovery", () => {
  const recovery = new URL(
    agentBrowserRecoveryUrl("/agent/authorize", {
      client_id: ["first", "second"],
      state: undefined,
    }),
  );
  expect(recovery.searchParams.getAll("client_id")).toEqual([
    "first",
    "second",
  ]);
  expect(recovery.searchParams.has("state")).toBe(false);
});
it("returns not-found for a disabled account page and handles revoked membership without loading connections", async () => {
  vi.stubEnv("AGENT_ACCOUNT_CHANNEL_ENABLED", "false");
  await expect(AgentConnectionsPage()).rejects.toThrow("NEXT_NOT_FOUND");
  vi.stubEnv("AGENT_ACCOUNT_CHANNEL_ENABLED", "true");
  state.member.mockResolvedValue(undefined);
  expect(renderToStaticMarkup(await AgentConnectionsPage())).toContain(
    "구매사 계정에서 연결해요",
  );
  expect(state.connections).not.toHaveBeenCalled();
});
it.each(["https://attacker.test", "null", ""])(
  "rejects a browser mutation with origin %s before session data access",
  async (origin) => {
    if (origin) state.headers.set("origin", origin);
    else state.headers.delete("origin");
    await expect(agentBrowserActor(true)).rejects.toMatchObject({
      status: 403,
    });
    expect(state.member).not.toHaveBeenCalled();
  },
);
it("checks feature state, host and live membership, even with a browser session", async () => {
  vi.stubEnv("AGENT_ACCOUNT_CHANNEL_ENABLED", "false");
  await expect(agentBrowserActor()).rejects.toMatchObject({ status: 404 });
  vi.stubEnv("AGENT_ACCOUNT_CHANNEL_ENABLED", "true");
  state.headers.set("host", "partner.support-b.test");
  await expect(agentBrowserActor()).rejects.toMatchObject({ status: 404 });
  state.headers.set("host", "support-b.test");
  state.member.mockResolvedValue(undefined);
  await expect(agentBrowserActor()).rejects.toMatchObject({ status: 403 });
});
it("cannot approve a different workspace from the one shown on the consent page", async () => {
  const form = new FormData();
  form.set("decision", "approve");
  await expect(
    authorizeAgentAction({}, "previous-buyer", form),
  ).rejects.toMatchObject({ code: "workspace_changed" });
  expect(state.authorize).not.toHaveBeenCalled();
  await expect(authorizeAgentAction({}, "buyer", form)).rejects.toThrow(
    "redirect:http://localhost/callback",
  );
  expect(state.authorize).toHaveBeenCalledWith(
    {},
    { userId: "user", workspaceId: "buyer" },
    true,
  );
});
it("treats missing or forged consent values as a denial", async () => {
  const form = new FormData();
  form.set("confirmed", "true");
  await expect(authorizeAgentAction({}, "buyer", form)).rejects.toThrow(
    "redirect:",
  );
  expect(state.authorize).toHaveBeenCalledWith(
    {},
    { userId: "user", workspaceId: "buyer" },
    false,
  );
});
