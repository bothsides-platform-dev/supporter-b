import { expect, it } from "vitest";
import {
  buildPlatformAgreementDocument,
  platformAgreementParty,
} from "../platform-agreement";

it("노온과 구매사 계약에 선정 PG를 이용 대상으로 명시한다", () => {
  const doc = buildPlatformAgreementDocument("구매회사", "선정결제회사");
  expect(doc.preamble).toContain("주식회사 노온");
  expect(doc.preamble).toContain("구매회사");
  expect(doc.preamble).toContain("선정결제회사");
  const term = doc.clauses.find((c) => c.id === "term");
  expect(term).toMatchObject({
    body: expect.stringContaining("실제 이용 시작일부터 2년"),
  });
  const termination = doc.clauses.find((c) => c.id === "termination");
  expect(termination).toMatchObject({
    body: expect.stringContaining("노온에 반환"),
  });
  expect(JSON.stringify(doc)).not.toContain("상계");
  expect(doc.closing).toContain("사전 날인");
  expect(platformAgreementParty()).toEqual({
    company: "주식회사 노온",
    bizNo: "6528703871",
    representative: "이성연",
    address: "서울특별시 강남구 강남대로112길 47, 2층 867에이호(논현동)",
  });
});
