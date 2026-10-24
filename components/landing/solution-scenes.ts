export type SolutionScene = {
  title: string;
  description: string;
  example: "fee" | "conditions" | "negotiation" | "decision";
};

export const SOLUTION_SCENES: SolutionScene[] = [
  {
    title: "우리 조건에 맞는 수수료를 확인해요",
    description: "업종과 거래 규모를 바탕으로 받은 견적을 살펴봐요.",
    example: "fee",
  },
  {
    title: "도입 전에 필요한 조건을 살펴봐요",
    description: "심사 상태부터 정산주기, 보증보험, 가입비까지 확인해요.",
    example: "conditions",
  },
  {
    title: "받은 견적에서 한 번 더 협의해요",
    description: "조정이 필요한 조건을 담당자와 이야기해요.",
    example: "negotiation",
  },
  {
    title: "조건을 확인하고 직접 결정해요",
    description: "협의한 조건을 종합해 우리 사업에 맞는 견적을 선택해요.",
    example: "decision",
  },
];
