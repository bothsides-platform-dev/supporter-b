import { expect, it } from "vitest";
import {
  journeyInputSchema,
  sanitizeJourneyEvent,
  formatJourneyEvents,
  formatJourneyAnalytics,
} from "@/lib/guest-rfp/journey-contract";
const event = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "funnel_step_error",
  funnel_id: "questions",
  step_id: "industry",
  observedAt: "2026-10-20T05:03:45.000Z",
  error_code: "VALIDATION",
};
it("allows only defined steps and fixed errors, never input text or browser success claims", () => {
  const input = { draftId: event.id, op: "events", events: [event] };
  expect(journeyInputSchema.safeParse(input).success).toBe(true);
  for (const change of [
    { memo: "secret" },
    { step_id: "secret" },
    { error_code: "email@example.com" },
    { name: "sign_up" },
    { name: "quote_request_submitted" },
  ])
    expect(
      journeyInputSchema.safeParse({
        ...input,
        events: [{ ...event, ...change }],
      }).success,
    ).toBe(false);
  expect(
    sanitizeJourneyEvent("funnel_step_error", {
      funnel_id: "questions",
      step_id: "industry",
      error_code: "raw secret",
    }),
  ).toMatchObject({ error_code: "UNKNOWN" });
  expect(
    sanitizeJourneyEvent("sign_up", {
      funnel_id: "signup",
      step_id: "account_created",
    }),
  ).toBeNull();
});
it("keeps repeated errors and chronological KST timestamps without answer contents", () => {
  const later = {
    ...event,
    id: "20000000-0000-4000-8000-000000000001",
    observedAt: "2026-10-20T05:03:58.000Z",
  };
  const text = formatJourneyEvents([later, event] as never);
  expect(text).toContain("14:03:45 업종 입력 오류");
  expect(text).toContain("14:03:58 업종 입력 오류");
  expect(text.indexOf("14:03:45")).toBeLessThan(text.indexOf("14:03:58"));
});
it("distinguishes a replay link from verified playback and never constructs a GA user URL", () => {
  const text = formatJourneyAnalytics(
    [
      {
        observedAt: event.observedAt,
        clarity: { userId: "u1", sessionId: "s1" },
        ga: { clientId: "123.456", sessionId: "123" },
      },
    ],
    "user-id",
    "https://analytics.google.com/analytics/web/#/analysis/p540469131/edit/report",
  );
  expect(text).toContain(
    "https://clarity.microsoft.com/player/xiq81e87yn/u1/s1",
  );
  expect(text).toContain("재생 가능 여부는 확인하지 않았어요");
  expect(text).toContain("123.456");
  expect(text).toContain("user-id");
  expect(formatJourneyAnalytics([], null, undefined)).toContain(
    "식별자 미확보",
  );
});

it("uses the Korean calendar date at the UTC day boundary", () => {
  expect(
    formatJourneyAnalytics([{ observedAt: "2026-10-20T16:00:00.000Z" }], null),
  ).toContain("2026-10-21");
});
