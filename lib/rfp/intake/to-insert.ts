// 견적 요청 입력 — 검증된 입력을 RFP 신규 insert 행으로 바꾼다. 서버 전용.
//
// 문자열 필드의 trim 과 빈 값 → null 규칙, 발송 여부에 따른 status/sentAt/boardVisible
// 파생은 전부 여기서만 일어난다. 서비스는 id·code·스냅샷·작성자·시각만 공급한다.
import { randomUUID } from "node:crypto";
import type { NewRfpInsert } from "@/lib/server/repositories/types";
import type { ParsedCreateRfpInput } from "./schema";

/** 서비스가 트랜잭션 안에서 발급·조회해 넘기는 값. 입력 자체에는 없다. */
export type NewRfpIdentity = {
  id: string;
  code: string;
  buyerWsId: string;
  /** biz_profiles 스냅샷 id. `bizProfileMode: 'none'` 이거나 상속할 프로필이 없으면 null. */
  bizProfileId: string | null;
  createdBy: string;
  now: Date;
};

const text = (value: string | undefined): string | null => value?.trim() ?? null;

export function toNewRfpInsert(
  input: ParsedCreateRfpInput,
  identity: NewRfpIdentity,
): NewRfpInsert {
  const send = input.send;
  return {
    id: identity.id,
    code: identity.code,
    buyerWsId: identity.buyerWsId,
    bizProfileId: identity.bizProfileId,
    title: input.title.trim(),
    memo: input.memo?.trim() ?? "",
    websiteUrl: text(input.websiteUrl),
    mainProducts: text(input.mainProducts),
    monthlyAvgPgVolume: text(input.monthlyAvgPgVolume),
    currentFeeRate: text(input.currentFeeRate),
    currentSettlementLimit: text(input.currentSettlementLimit),
    currentGuaranteeInsurance: text(input.currentGuaranteeInsurance),
    currentSettlementCycle: text(input.currentSettlementCycle),
    deliveryServicePeriod: text(input.deliveryServicePeriod),
    productInfo: input.productInfo,
    // 맞춤 상담(send) 은 게시판에 올리지 않는다 — 입력값과 무관하게 false.
    boardVisible: send ? false : input.boardVisible,
    currentFeeVisibleToPg: input.currentFeeVisibleToPg,
    contractType: input.contractType ?? null,
    currentSolution: input.currentSolution ?? null,
    currentSolutionDetail: text(input.currentSolutionDetail),
    deadline: input.deadline,
    status: send ? "sent" : "draft",
    requiredPaymentMethods: input.requiredPaymentMethods,
    // 커스텀 결제수단 id 는 서버가 발급한다 — 클라이언트 값은 받지 않는다.
    customPaymentMethods: input.customPaymentMethods.map((method) => ({
      id: randomUUID(),
      label: method.label.trim(),
    })),
    createdBy: identity.createdBy,
    sentAt: send ? identity.now : null,
  };
}
