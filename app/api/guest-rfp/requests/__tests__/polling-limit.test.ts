import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { POST } from "../route";
import { checkGuestDraftRequest } from "@/lib/server/guest-rfp/draft-request";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), revoked: vi.fn(), status: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/session", () => ({ isSessionRevoked: mocks.revoked }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/server/repositories/factory", () => ({ getGuestRequestRepo: async () => ({ owned: async () => [], workspaces: async () => [] }) }));
vi.mock("@/lib/server/services/guest-requests", () => ({ getGuestRequestService: async () => ({ status: mocks.status }) }));
const id = "10000000-0000-4000-8000-000000000001";
const request = (op: string) => new Request("http://localhost:3000/api/guest-rfp/requests", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ op, id }) });
let time = Date.now();
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(time += 120000); mocks.auth.mockResolvedValue({ user: { id: "user", workspaceId: id } }); mocks.revoked.mockResolvedValue(false); mocks.status.mockResolvedValue(null); });
afterEach(() => vi.useRealTimers());
it("authenticated polling does not exhaust the public draft save and reservation budget", async () => {
  for (let i = 0; i < 80; i++) expect((await POST(request(["account", "list", "status"][i % 3]))).status).toBe(200);
  expect(checkGuestDraftRequest(request("save"))).toBeNull();
});
it("keeps rate limiting reservation mutations and anonymous polling", async () => {
  for (let i = 0; i < 60; i++) checkGuestDraftRequest(request("save"));
  expect((await POST(request("reserve"))).status).toBe(429);
  mocks.auth.mockResolvedValue(null);
  expect((await POST(request("status"))).status).toBe(429);
});
it("rejects revoked sessions and keeps ownership checks for authenticated status reads", async () => {
  mocks.revoked.mockResolvedValue(true);
  expect((await POST(request("list"))).status).toBe(401);
  mocks.revoked.mockResolvedValue(false);
  mocks.status.mockRejectedValue(new Error("GUEST_DRAFT_UNAVAILABLE"));
  expect((await POST(request("status"))).status).toBe(409);
});
