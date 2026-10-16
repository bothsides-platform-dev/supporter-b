import { describe, expect, it } from "vitest";
import {
  guestAnswersSchema,
  selectGuestAnswers,
} from "@/lib/guest-rfp/answers";

describe("public answer boundary", () => {
  it("preserves current PG answers across server serialization", () => {
    const currentPgs = [{ pgWorkspaceId: null, name: "기존 PG" }];
    expect(selectGuestAnswers({ currentPgs })).toEqual({ currentPgs });
  });
  it("projects only question answers, excluding routing, calculator and PG state", () => {
    expect(
      selectGuestAnswers({
        title: "견적",
        websiteUrl: "https://example.com",
        allowedPgWorkspaceIds: ["secret"],
        savings: 100,
        matchingRequestKey: "internal",
      }),
    ).toEqual({ title: "견적", websiteUrl: "https://example.com" });
  });
  it("rejects unknown keys and oversized answers while preserving unanswered booleans", () => {
    expect(
      guestAnswersSchema.safeParse({ title: "x", allowedPgWorkspaceIds: [] })
        .success,
    ).toBe(false);
    expect(
      guestAnswersSchema.safeParse({ memo: "x".repeat(2001) }).success,
    ).toBe(false);
    expect(
      guestAnswersSchema.parse({ productInfo: { cashConvertible: false } }),
    ).toEqual({ productInfo: { cashConvertible: false } });
  });
});
