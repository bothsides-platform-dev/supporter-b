import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "../route";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  cookie: vi.fn(),
  cancel: vi.fn(),
  status: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/session", () => ({ isSessionRevoked: async () => false }));
vi.mock("@/lib/server/services/guest-requests", () => ({
  getGuestRequestService: async () => ({
    status: mocks.status,
    cancel: mocks.cancel,
  }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(null);
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookie }),
}));
it("rejects cross-origin mutations before accessing ownership", async () => {
  expect(
    (
      await POST(
        new Request("http://localhost:3000/api/guest-rfp/requests", {
          method: "POST",
          headers: {
            origin: "https://other.example",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            op: "cancel",
            id: "10000000-0000-4000-8000-000000000001",
          }),
        }),
      )
    ).status,
  ).toBe(403);
});
it("rejects unauthenticated reads without a draft proof", async () => {
  expect(
    (
      await POST(
        new Request("http://localhost:3000/api/guest-rfp/requests", {
          method: "POST",
          headers: {
            origin: "http://localhost:3000",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            op: "status",
            id: "10000000-0000-4000-8000-000000000001",
          }),
        }),
      )
    ).status,
  ).toBe(401);
});

it("allows a logged-in owner of a browser proof to cancel before choosing a workspace", async () => {
  mocks.auth.mockResolvedValue({
    user: { id: "user", workspaceId: "10000000-0000-4000-8000-000000000002" },
  });
  mocks.cookie.mockReturnValue({ value: "proof" });
  mocks.status.mockRejectedValue(new Error("GUEST_DRAFT_UNAVAILABLE"));
  const id = "10000000-0000-4000-8000-000000000001";
  const response = await POST(
    new Request("http://localhost:3000/api/guest-rfp/requests", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ op: "cancel", id }),
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.cancel).toHaveBeenCalledWith(id, { secret: "proof" });
});
