import { expect, it } from "vitest";
import { isSensitiveAnalyticsUrl } from "../url-privacy";

it.each([
  "/agent/authorize",
  "/api/agent/oauth/authorize",
  "/callback?state=private-state",
  "/callback?code=private-code",
  "/callback?code_verifier=private-verifier",
  "/callback?code_challenge=private-challenge",
  "/callback#access_token=private-token",
  `/login?next=${encodeURIComponent("/agent/authorize?state=private-state")}`,
  `/login?next=${encodeURIComponent(encodeURIComponent("/callback?code_verifier=private-verifier"))}`,
  "/login?next=%ZZ",
])("marks auth URL as private: %s", (value) => {
  expect(isSensitiveAnalyticsUrl(value)).toBe(true);
});

it.each([
  "/",
  "/login?next=%2Fhome",
  "/?utm_source=google&utm_campaign=summer",
  "https://google.com/search?q=payment",
  "/guide?stateful=true",
])("preserves ordinary attribution: %s", (value) => {
  expect(isSensitiveAnalyticsUrl(value)).toBe(false);
});
