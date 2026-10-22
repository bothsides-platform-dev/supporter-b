import { describe, expect, it } from "vitest";
import { layoutContract, PAGE, type LayoutInput } from "../layout";
import { collectDrawableText } from "../doc-text";
import { buildPlatformAgreementDocument } from "../platform-agreement";

const party = {
  company: "구매회사",
  bizNo: "1234567890",
  address: "서울시 강남구",
  representative: "김대표",
};
const input = {
  kind: "platform_buyer",
  doc: buildPlatformAgreementDocument("구매회사", "선정 PG"),
  parties: { buyer: party, platform: { ...party, company: "주식회사 노온" } },
  feeRows: [
    {
      label: "계좌이체",
      value: "1.80%",
      standard: "2.00%",
      discount: "0.20%p",
    },
  ],
  seal: { version: "test-seal-v1", sha256: "a".repeat(64) },
} satisfies LayoutInput;

describe("노온 사전 날인 합의서 레이아웃", () => {
  it("노온을 PG로 재해석하지 않고 구매사 서명칸과 별도 날인 영역을 만든다", () => {
    const result = layoutContract(input, {
      widthOf: (text, size) => (text.length * size) / 2,
    });
    expect(result.fields.map(({ party, type }) => ({ party, type }))).toEqual([
      { party: "buyer", type: "signature" },
    ]);
    expect(result.ops.filter((op) => op.op === "seal")).toHaveLength(1);
    const text = result.ops
      .filter((op) => op.op === "text")
      .map((op) => op.text)
      .join("");
    expect(text).toContain("주식회사 노온");
    expect(text).not.toContain("을 (PG사)");
    expect(
      result.fields.every((field) => field.y + field.height < PAGE.height),
    ).toBe(true);
  });

  it("노온 회사 정보도 발송 전 글리프 검증에 포함한다", () => {
    expect(collectDrawableText(input)).toContain("주식회사 노온");
  });
});
