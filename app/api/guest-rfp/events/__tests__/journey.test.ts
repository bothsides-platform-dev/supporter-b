import { afterEach, beforeEach, expect, it, vi } from "vitest";
const handle = vi.hoisted(() =>
  vi.fn(async (_input: unknown) => Response.json({ enabled: true })),
);
vi.mock("@/lib/server/guest-rfp/journey-request", () => ({
  handleJourneyRequest: handle,
}));
vi.mock("@/lib/server/services/guest-rfp", () => ({
  recordGuestEvent: vi.fn(),
}));
import { POST } from "../route";
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_BUYER_ORIGIN", "https://support-b.com");
  vi.stubEnv("NEXT_PUBLIC_PARTNER_ORIGIN", "https://partner.support-b.com");
  handle.mockClear();
});
afterEach(() => vi.unstubAllEnvs());
const base = {
  draftId: "10000000-0000-4000-8000-000000000001",
  op: "events",
  events: [
    {
      id: "20000000-0000-4000-8000-000000000001",
      observedAt: new Date().toISOString(),
      name: "funnel_step_view",
      funnel_id: "questions",
      step_id: "industry",
    },
  ],
};
const req = (input: unknown, origin = "https://support-b.com") =>
  new Request("https://support-b.com/api/guest-rfp/events", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "x-forwarded-for": crypto.randomUUID(),
    },
    body: JSON.stringify(input),
  });
it("accepts strict event batches through the existing origin and size gates", async () => {
  expect((await POST(req(base))).status).toBe(200);
  expect(handle).toHaveBeenCalledWith(base);
  expect((await POST(req(base, "https://evil.test"))).status).toBe(403);
  expect((await POST(req({ ...base, memo: "secret" }))).status).toBe(400);
  expect(
    (
      await POST(
        req({ ...base, events: [{ ...base.events[0], name: "sign_up" }] }),
      )
    ).status,
  ).toBe(400);
  expect((await POST(req({ ...base, memo: "x".repeat(5000) }))).status).toBe(
    413,
  );
  expect(handle).toHaveBeenCalledTimes(1);
});
