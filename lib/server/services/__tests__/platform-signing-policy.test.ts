import { expect, it } from "vitest";
import {
  observedParticipantsMeetAuthoritativePolicy,
  storedParticipantsMeetAuthoritativePolicy,
} from "../signing-policy";
const observed = {
  name: "구매담당",
  email: "buyer@example.com",
  status: "pending",
  securityMethod: "identity_verification",
};
it("신규 계약은 지정 구매사 한 명의 본인인증만 허용한다", () => {
  expect(
    observedParticipantsMeetAuthoritativePolicy(
      [observed],
      "buyer@example.com",
      new Set(),
      "platform_buyer",
    ),
  ).toBe(true);
  for (const participants of [
    [],
    [observed, observed],
    [{ ...observed, email: "other@example.com" }],
    [{ ...observed, securityMethod: "email" }],
  ]) {
    expect(
      observedParticipantsMeetAuthoritativePolicy(
        participants,
        "buyer@example.com",
        new Set(),
        "platform_buyer",
      ),
    ).toBe(false);
  }
  const buyer = { userId: "buyer", email: "buyer@example.com" };
  const p = {
    id: "p",
    contractId: "c",
    userId: "buyer",
    role: "buyer" as const,
    securityMethod: "easy_cert" as const,
    status: "pending" as const,
    name: "구매담당",
    email: buyer.email,
  };
  expect(
    storedParticipantsMeetAuthoritativePolicy([p], buyer, [], "platform_buyer"),
  ).toBe(true);
  expect(
    storedParticipantsMeetAuthoritativePolicy(
      [{ ...p, userId: "other" }],
      buyer,
      [],
      "platform_buyer",
    ),
  ).toBe(false);
  expect(
    storedParticipantsMeetAuthoritativePolicy([p], buyer, [], "pg_buyer"),
  ).toBe(false);
});
