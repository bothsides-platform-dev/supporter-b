// 어려운 용어 설명 모음 (single source of truth)
//
// 화면 곳곳의 금융 전문용어·도메인 용어에 붙는 인포(ⓘ) 아이콘이 보여 줄 설명을 여기 한 곳에
// 모은다. <InfoTip term="정산주기" />가 이 표를 읽으므로, 설명을 고치면 모든 화면에 동시에 반영된다.
//
// - description 은 해요체·쉬운 말로 (UX_WRITING.md 보이스톤).
// - 이 파일은 용어의 *설명*만 담는다. 용어 *정의*(견적 요청=RFP 등)의 정전(canonical)은
//   UX_WRITING.md §8 도메인 용어집 — 여기서 용어 등가를 재정의하지 않는다.

export type GlossaryEntry = {
  /** 카드 제목으로 보일 용어명 */
  label: string;
  /** 해요체 한두 문장 설명 */
  description: string;
};

export const GLOSSARY = {
  정산주기: {
    label: '정산 주기',
    description:
      '결제가 일어난 뒤 판매대금이 통장에 들어오기까지 걸리는 기간이에요. D+1은 결제 다음 영업일, W+1은 1주 뒤를 뜻해요. 숫자가 작을수록 돈을 빨리 받아요.',
  },
  NDX: {
    label: '배송 및 서비스 기간',
    description:
      '결제 후 실제 배송이나 서비스 제공까지 걸리는 기간이에요. D+1은 다음 영업일 배송, D+7은 최대 7일 처리를 뜻해요. PG는 이 기간을 리스크 평가에 참고해요.',
  },
  정산한도: {
    label: '정산한도',
    description:
      '한 PG가 정해 둔 정산 금액의 상한이에요. 매출 규모가 크면 한도가 충분한지 확인하는 게 좋아요.',
  },
  보증보험: {
    label: '보증보험',
    description:
      '정산·환불 사고에 대비해 PG가 요구하는 보증 보험이에요. 금액이 작을수록 부담이 적어요. 비용은 1% 내외로 부과돼요. 월 1000만원 기준 10만원 내외 비용이 부과돼요.',
  },
  가입비: {
    label: '가입비',
    description:
      '계약할 때 한 번만 내는 초기 가입 비용이에요. 셋업비라고도 불러요. 매달 내는 비용이 아니에요.',
  },
  수수료율: {
    label: '수수료율',
    description:
      '결제 금액에서 PG가 가져가는 비율이에요. 1만 원을 결제받고 수수료율이 3%면 부가세 10% 포함 3.3%가 적용되어 330원을 뺀 9630원이 정산돼요.',
  },
  가맹점등급: {
    label: '가맹점 등급',
    description:
      '연 매출 규모로 나뉘는 가맹점 분류예요. PG에게 전달되는 참고 정보로, 카드 수수료는 PG와 협상해요.',
  },
  과세유형: {
    label: '과세유형',
    description:
      '세금을 매기는 사업자 구분이에요. 일반과세·간이과세 등으로 나뉘고, 세금계산서 발행 방식이 달라요.',
  },
  견적요청: {
    label: '견적 요청',
    description:
      '구매사가 결제 조건을 적어 여러 PG에 한 번에 보내는 요청이에요. PG는 이걸 보고 견적을 보내요.',
  },
  견적: {
    label: '견적',
    description:
      'PG가 견적 요청을 받고 보내는 조건 제안이에요. 정산주기·수수료·한도가 담겨요.',
  },
  선정: {
    label: '선정',
    description:
      '받은 견적 중 한 곳을 최종으로 고르는 거예요. 선정하면 나머지 PG에 결과가 자동으로 안내돼요.',
  },
  참여요청: {
    label: '참여 요청',
    description:
      "초대받지 않은 PG가 공개된 견적 요청에 먼저 참여하겠다고 보내는 신청이에요. 구매사가 직접 지정하는 '초대'와는 달라요.",
  },
  견적유형: {
    label: '견적 유형',
    description:
      'PG와 처음 계약을 맺으면 신규 계약, 기존 PG와 계약 기간이 끝나 다시 맺으면 갱신 계약이에요. 선택 사항이며, PG가 제안 조건을 맞출 때 참고해요.',
  },
} satisfies Record<string, GlossaryEntry>;

export function getGlossaryEntry(term: string): GlossaryEntry | undefined {
  return (GLOSSARY as Record<string, GlossaryEntry>)[term];
}
