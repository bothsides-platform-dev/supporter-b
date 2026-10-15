import { expect, it } from "vitest";
import { buildAdminSignupSlackText } from "../admin-signup";
it("includes all stored questions, distinguishes missing answers and escapes free text", () => {
  const text = buildAdminSignupSlackText({
    workspaceName: "회사",
    orgType: "buyer",
    reviewUrl: "https://admin.example/review",
    guestDraft: {
      industryName: "의류",
      files: [{ name: "<!channel>.pdf", size: 123 }],
      answers: {
        websiteUrl: "https://example.com",
        currentSolution: "other",
        currentSolutionDetail: "<x>",
        industryMode: "registered",
        mainProducts: "옷",
        productInfo: {
          cashConvertible: false,
          maximumPrice: "under_100k",
          salesMethods: ["none"],
        },
        contractType: "renewal",
        requiredPaymentMethods: ["card"],
        customPaymentMethods: [{ label: "<custom>" }],
        annualPgVolume: "100",
        currentFeeRate: "2.1",
        currentFeeVisibleToPg: false,
        currentSettlementLimit: "200",
        currentGuaranteeInsurance: "300",
        currentSettlementCycle: "D+3",
        deliveryServicePeriod: "D+5",
        title: "<견적>",
        memo: "<!here>",
      },
    },
  });
  for (const label of [
    "홈페이지",
    "구축 방식",
    "업종",
    "주요 상품",
    "입점 판매자: 미입력",
    "환금성 상품: 없어요",
    "최고 상품 가격대",
    "판매 방식",
    "계약 유형",
    "결제수단",
    "연간 PG 거래액",
    "현재 카드 수수료",
    "수수료 공개",
    "정산한도",
    "보증보험",
    "정산주기",
    "배송·서비스 기간",
    "제목",
    "추가 내용",
    "123 bytes",
  ])
    expect(text).toContain(label);
  expect(text).toContain("&lt;!channel&gt;.pdf");
  expect(text).toContain("&lt;!here&gt;");
  expect(text).not.toContain("<!");
});
