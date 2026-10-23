export type SolutionScene = {
  title: string;
  emphasis: string;
  description: string;
  example: "fee" | "conditions" | "negotiation" | "decision";
};

export const SOLUTION_SCENES: SolutionScene[] = [
  {
    title: "우리 사업에 맞는",
    emphasis: "수수료를 확인해요",
    description: "사업 조건에 맞춰 받은 견적에서 수수료를 명확하게 확인해요.",
    example: "fee",
  },
  {
    title: "도입 전에",
    emphasis: "필요한 조건을 살펴봐요",
    description:
      "PG 검토와 카드사 승인 상태부터 정산주기, 보증보험, 가입비까지 확인해요.",
    example: "conditions",
  },
  {
    title: "더 나은 조건을 위해",
    emphasis: "한 번 더 협의해요",
    description:
      "받은 견적을 바탕으로 필요한 조건을 이야기하고, 수정된 견적을 확인해요.",
    example: "negotiation",
  },
  {
    title: "확인부터 결정까지",
    emphasis: "한곳에서 이어가요",
    description:
      "협의한 조건을 다시 확인하고, 우리 사업에 맞는 견적을 선택해요.",
    example: "decision",
  },
];
