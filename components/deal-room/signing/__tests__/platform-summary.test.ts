import { expect, it } from "vitest";
import { buildSigningSummary } from "../signing-view-model";
it("구매사 대기 상태의 주체는 구매사이며 PG 준비를 기다리지 않는다", () => {
  expect(
    buildSigningSummary(
      {
        contract: { kind: "platform_buyer", status: "awaiting_pg_template" },
        participants: [],
      } as never,
      "buyer",
    ).label,
  ).toBe("합의서 작성");
});
