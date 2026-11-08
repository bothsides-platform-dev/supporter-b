import { agentRequestContent } from "./request-input";
import { productInfoRows } from "@/lib/rfp/product-info";
import { PAYMENT_METHOD_LABELS } from "@/lib/types/bid";
import { z } from "zod";
import { solutionLabel } from "@/lib/rfp/solutions";

export function agentReviewRows(
  content: z.output<typeof agentRequestContent>,
  pgName: string,
  industryName: string,
): [string, string][] {
  const rows: [string, string | undefined][] = [
    ["제목", content.title],
    ["상담 유형", content.contractType === "renewal" ? "PG 변경" : "신규 도입"],
    ["상담 PG사", pgName],
    ["업종", industryName],
    ["홈페이지", content.websiteUrl],
    ["주요 판매 상품", content.mainProducts],
    ["배송과 서비스 기간", content.deliveryServicePeriod],
    [
      "결제수단",
      [
        ...content.requiredPaymentMethods.map((v) => PAYMENT_METHOD_LABELS[v]),
        ...content.customPaymentMethods.map((v) => v.label),
      ].join(", "),
    ],
    ...productInfoRows(content.productInfo),
    [
      "마감일",
      content.deadline
        ? new Intl.DateTimeFormat("ko-KR", {
            timeZone: "Asia/Seoul",
            dateStyle: "long",
            timeStyle: "short",
          }).format(new Date(content.deadline))
        : undefined,
    ],
    ["현재 이용 PG", content.currentPgs?.map((p) => p.name).join(", ")],
    ["전년도 월 평균 PG 거래액", content.monthlyAvgPgVolume],
    ["현재 카드 수수료", content.currentFeeRate],
    [
      "현재 카드 수수료 공개",
      content.contractType === "renewal"
        ? content.currentFeeVisibleToPg
          ? "상담 PG사에 공개해요"
          : "상담 PG사에 공개하지 않아요"
        : undefined,
    ],
    ["현재 정산 한도", content.currentSettlementLimit],
    ["현재 보증보험", content.currentGuaranteeInsurance],
    ["현재 정산주기", content.currentSettlementCycle],
    [
      "운영 솔루션",
      content.currentSolution
        ? solutionLabel(content.currentSolution)
        : undefined,
    ],
    ["운영 솔루션 상세", content.currentSolutionDetail],
    ["추가 요청", content.memo],
  ];
  return rows.filter(
    (row): row is [string, string] => row[1] !== undefined && row[1] !== "",
  );
}
