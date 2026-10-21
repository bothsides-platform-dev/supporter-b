import type { ContractDoc } from "@/lib/types/contract-doc";
import { siteConfig } from "@/lib/site-config";
import { AGREEMENT_TITLE } from "./agreement";

export const PLATFORM_AGREEMENT_VERSION = "2026-10-21-v1";

export function platformAgreementParty() {
  const operator = siteConfig.operator;
  return {
    company: "주식회사 노온",
    bizNo: operator.businessRegistrationNumber.replace(/-/g, ""),
    representative: operator.representative,
    address: operator.address,
  };
}

// Separate from legacy PG–buyer wording: historic contracts must not be reinterpreted.
export function buildPlatformAgreementDocument(
  buyer: string,
  selectedPg: string,
): ContractDoc {
  return {
    _v: 1,
    title: AGREEMENT_TITLE,
    preamble: `${buyer}(이하 “구매사”)와 주식회사 노온(이하 “노온”)은 구매사가 선정한 ${selectedPg}(이하 “선정 PG사”)의 전자결제서비스 장기이용에 따른 수수료 할인에 관하여 다음과 같이 합의한다. 선정 PG사는 본 합의서의 계약 당사자가 아니며, 구매사와 선정 PG사가 체결하였거나 체결할 전자결제서비스 이용계약을 “원 계약”이라 한다.`,
    clauses: [
      {
        id: "purpose",
        kind: "text",
        heading: "목적",
        body: "본 합의서는 구매사의 전자결제서비스 장기이용에 따른 수수료 할인과 관련한 권리와 의무 및 기타 사항을 정함을 목적으로 한다.",
      },
      {
        id: "discount",
        kind: "text",
        heading: "수수료 할인",
        body: "① 구매사가 약정기간 동안 선정 PG사가 제공하는 전자결제서비스만을 이용하는 조건으로 수수료 할인을 제공한다. 다만 PG사의 시스템 장애로 2시간 이상 서비스를 이용할 수 없어 정상화까지 다른 서비스를 이용하는 경우, PG사의 귀책사유로 계약을 해지하는 경우 또는 양 당사자가 사전에 합의한 경우에는 독점 이용 조건 위반으로 보지 않는다.\n② 최종 적용 수수료는 별첨 표와 같다. 구체적인 정산방식은 원 계약을 따르며 할인 적용에 오류가 있으면 상대방에게 통보하고 다음 정산에 반영한다.",
      },
      {
        id: "term",
        kind: "text",
        heading: "약정기간",
        body: "약정기간은 구매사의 선정 PG사 전자결제서비스 실제 이용 시작일부터 2년으로 한다. 원 계약이 종료되면 본 합의서도 함께 종료된다. 본 합의서의 서명만으로 원 계약의 체결 사실을 확인한 것으로 보지 않는다.",
      },
      {
        id: "termination",
        kind: "text",
        heading: "계약조건의 변경 및 해지",
        body: "① 구매사가 사전 합의 없이 제3자의 전자결제서비스를 이용하여 독점 이용 조건을 위반한 경우, 구매사의 귀책사유로 원 계약 또는 본 합의서가 해제되거나 해지된 경우, 구매사가 PG사에 대하여 보유한 채권에 가압류나 압류명령 또는 체납처분 등 강제집행이 개시된 경우에는 노온은 본 합의서를 해제하거나 해지할 수 있다.\n② 위 사유가 발생하면 구매사는 약정기간 동안 실제 할인받은 수수료 금액을 노온에 반환한다. 할인액은 별첨의 표준 수수료와 최종 수수료 차이에 해당 기간의 실제 거래액 또는 결제 건수를 적용하여 산정한다. 노온은 산정 근거를 구매사에게 제공한다.\n③ 위 사유로 노온에 별도의 손해가 발생한 경우 구매사는 그 손해를 배상한다.",
      },
      {
        id: "confidentiality",
        kind: "text",
        heading: "비밀유지",
        body: "양 당사자는 본 합의서의 내용과 이행 과정에서 알게 된 상대방의 업무상 비밀, 자료와 정보를 비밀로 유지하고, 상대방의 사전 서면동의 없이 제3자에게 공개하거나 계약 외 목적으로 사용하지 않는다. 이를 위반하여 발생한 손해는 귀책사유가 있는 당사자가 배상한다.",
      },
      {
        id: "assignment",
        kind: "text",
        heading: "양도금지",
        body: "각 당사자는 상대방의 사전 서면동의 없이 본 합의서에 따른 권리와 의무를 제3자에게 양도, 위임 또는 위탁하거나 담보로 제공하지 않는다.",
      },
      {
        id: "other",
        kind: "text",
        heading: "기타",
        body: "양 당사자는 신의성실에 따라 본 합의서를 이행한다. 별도 서면합의는 본 합의서의 일부를 구성한다. 명시되지 않은 사항은 원 계약을 따르며 원 계약 또는 이전 변경계약과 충돌하는 사항은 본 합의서를 우선 적용한다.",
      },
      {
        id: "fees",
        kind: "feeTable",
        heading: "별첨: 수수료 할인 기준",
        intro:
          "표준 수수료, 할인 폭과 최종 적용 수수료를 아래 표에 명시한다. 부가세는 별도다. 최종 적용 수수료는 구매사가 선정한 견적과 같다. 표에 명시한 결제수단과 가맹점 등급에 적용한다.",
        outro: "",
      },
    ],
    closing:
      "노온은 본 합의서에 법인도장을 사전 날인하고, 구매사의 지정 담당자는 본인인증 후 전자서명한다. 구매사의 서명 완료일은 전자서명 기록에 따른다. 양 당사자는 서명 완료본을 전자문서로 보관한다.",
  };
}
