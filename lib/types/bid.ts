import type { Attachment } from './common';
import type { MerchantGrade } from './biz-profile';

export type PaymentMethod =
  | 'card'
  | 'overseas_card'
  | 'virtual_account'
  | 'bank_transfer'
  | 'naver_pay'
  | 'kakao_pay'
  | 'toss_pay'
  | 'mobile'
  | 'gift_card';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: '카드',
  overseas_card: '해외카드',
  virtual_account: '가상계좌',
  bank_transfer: '계좌이체',
  naver_pay: '네이버페이',
  kakao_pay: '카카오페이',
  toss_pay: '토스페이',
  mobile: '휴대폰결제',
  gift_card: '상품권',
};

export const PAYMENT_METHOD_CATEGORIES: {
  label: string;
  methods: PaymentMethod[];
}[] = [
  { label: '카드', methods: ['card', 'overseas_card'] },
  { label: '계좌', methods: ['virtual_account', 'bank_transfer'] },
  { label: '간편결제', methods: ['naver_pay', 'kakao_pay', 'toss_pay'] },
  { label: '기타', methods: ['mobile', 'gift_card'] },
];

export const STATUTORY_CARD_FEE: Record<MerchantGrade, number> = {
  small: 0.005,
  sme1: 0.011,
  sme2: 0.0125,
  sme3: 0.015,
  general: Number.NaN,
};

export type Bid = {
  id: string;
  rfpId: string;
  pgWsId: string;
  invitationId: string;
  // 정산주기: "D+1", "W+2", "M+1" 형식의 자유 텍스트
  settleCycle: string;
  // 정산한도 (원/월)
  settleLimit: number;
  // 월 보증보험 (원/연)
  guaranteeInsurance: number;
  // 결제수단별 수수료 (key: PaymentMethod, value: 소수 요율)
  paymentFees: Partial<Record<PaymentMethod, number>>;
  proposalPdfs: Attachment[];
  memo?: string;
  status: 'draft' | 'submitted' | 'withdrawn';
  submittedBy: string;
  submittedAt?: string;
  boardColumnId?: string | null;
};
