// 가상 샘플 온보딩 — DB 행을 만들지 않고 고정 데이터로 구매사/PG 딜룸 체험을 재현한다.
// 실제 타입(RFP/Bid)으로 선언해 제품 타입이 바뀌면 빌드가 깨지게 한다(단일소스 가드 —
// components/landing/demo-app/demo-app-fixtures.ts 와 같은 패턴). 서버·클라 양쪽에서
// import 가능 — DB 클라이언트·리포지토리 import 없음(client-safe). 값은 기존 DB 시드
// (lib/server/onboarding/sample-rfp.ts SAMPLE_BIDS)를 그대로 포팅했다 — 그 시더는
// stage 3까지 유지되므로 값을 바꿀 때는 양쪽을 함께 검토한다.
import type { RFP } from '@/lib/types/rfp';
import type { Bid, MerchantTier, TierRates } from '@/lib/types/bid';

/** /rfp/[id], /inbox/[rfpId] 라우트의 sentinel URL 세그먼트. 실제 코드는 P-YYMM-NNNN
 * 형식이라 소문자 'sample' 과 절대 충돌하지 않는다. */
export const SAMPLE_RFP_CODE = 'sample';

const SAMPLE_BUYER_WS_ID = 'sample-buyer-ws';
export const sampleBuyerName = '샘플 쇼핑몰';

const NOW_MS = Date.now();
const DAY_MS = 86_400_000;
const SAMPLE_DEADLINE = new Date(NOW_MS + 3650 * DAY_MS).toISOString();
const SAMPLE_CREATED_AT = new Date(NOW_MS - 3 * DAY_MS).toISOString();

export const SAMPLE_PG_IDS = ['sample-pg-a', 'sample-pg-b', 'sample-pg-c'] as const;

/** pgWsId → 표시명. lib/server/onboarding/sample-rfp.ts 의 DEMO_PG_NAMES 와 동일 어휘. */
export const samplePgNames: Record<string, string> = {
  [SAMPLE_PG_IDS[0]]: '샘플페이 A',
  [SAMPLE_PG_IDS[1]]: '샘플페이 B',
  [SAMPLE_PG_IDS[2]]: '샘플페이 C',
};

/** CounterpartyProfileCard 가 존재하지 않는 워크스페이스의 로고를 조회 시도하지 않도록 전부 null. */
export const samplePgLogoUpdatedAtMap: Record<string, string | null> = Object.fromEntries(
  SAMPLE_PG_IDS.map((id) => [id, null]),
);

function tierRates(rates: Record<MerchantTier, number>): TierRates {
  return rates;
}

export const sampleBuyerRfp: RFP = {
  id: 'sample-rfp',
  code: 'SAMPLE',
  buyerWsId: SAMPLE_BUYER_WS_ID,
  title: '온라인 쇼핑몰 PG 견적 요청 (샘플)',
  memo: '결제대행사 비교를 위한 샘플 견적 요청이에요. 받은 견적을 비교하고 선정하는 과정을 둘러볼 수 있어요.',
  mainProducts: '패션 의류 · 잡화',
  annualPgVolume: '1200000000',
  currentFeeRate: '2.8%',
  currentSettlementLimit: '30000000',
  currentGuaranteeInsurance: '없음',
  currentSettlementCycle: 'D+5',
  rfpFiles: [],
  allowedPgWorkspaceIds: [...SAMPLE_PG_IDS],
  deadline: SAMPLE_DEADLINE,
  status: 'sent',
  createdBy: 'sample-buyer-user',
  createdAt: SAMPLE_CREATED_AT,
  sentAt: SAMPLE_CREATED_AT,
  requiredPaymentMethods: ['card', 'virtual_account', 'naver_pay'],
  customPaymentMethods: [],
  boardVisible: false,
  currentFeeVisibleToPg: true,
  isSample: true,
  contractType: null,
};

/** PG 화면(RfpBriefPanel)용 — 같은 요청의 PG 시점 사본. bizProfile 없음(등급 미입력 데모). */
export const samplePgRfp: RFP = { ...sampleBuyerRfp };

// 세 비더를 의도적으로 차별화 — 비교가 의미를 갖도록 (SAMPLE_BIDS 포팅, sample-rfp.ts 참조).
export const sampleBids: Bid[] = [
  {
    id: 'sample-bid-a',
    rfpId: sampleBuyerRfp.id,
    pgWsId: SAMPLE_PG_IDS[0],
    invitationId: 'sample-inv-a',
    round: 1,
    settleCycle: 'D+2',
    settleLimit: 50_000_000,
    guaranteeInsurance: 5_000_000,
    paymentFees: {
      card: tierRates({ sole: 0.005, sme1: 0.008, sme2: 0.011, sme3: 0.013, general: 0.018 }),
      virtual_account: 300,
      naver_pay: 0.025,
    },
    customFees: {},
    proposalPdfs: [],
    memo: '카드 수수료가 가장 낮아요. 정산은 D+2예요.',
    status: 'submitted',
    submittedBy: 'sample-pg-a-user',
    submittedAt: SAMPLE_CREATED_AT,
  },
  {
    id: 'sample-bid-b',
    rfpId: sampleBuyerRfp.id,
    pgWsId: SAMPLE_PG_IDS[1],
    invitationId: 'sample-inv-b',
    round: 1,
    settleCycle: 'D+1',
    settleLimit: 100_000_000,
    guaranteeInsurance: 3_000_000,
    paymentFees: {
      card: tierRates({ sole: 0.006, sme1: 0.009, sme2: 0.012, sme3: 0.015, general: 0.02 }),
      virtual_account: 250,
      naver_pay: 0.023,
    },
    customFees: {},
    proposalPdfs: [],
    memo: '정산이 D+1로 빠르고 한도가 높아요.',
    status: 'submitted',
    submittedBy: 'sample-pg-b-user',
    submittedAt: SAMPLE_CREATED_AT,
  },
  {
    id: 'sample-bid-c',
    rfpId: sampleBuyerRfp.id,
    pgWsId: SAMPLE_PG_IDS[2],
    invitationId: 'sample-inv-c',
    round: 1,
    settleCycle: 'D+1',
    settleLimit: 80_000_000,
    guaranteeInsurance: 0,
    paymentFees: {
      card: tierRates({ sole: 0.007, sme1: 0.01, sme2: 0.013, sme3: 0.016, general: 0.022 }),
      virtual_account: 200,
      naver_pay: 0.019,
    },
    customFees: {},
    proposalPdfs: [],
    memo: '간편결제 수수료가 낮고 보증보험이 없어요.',
    status: 'submitted',
    submittedBy: 'sample-pg-c-user',
    submittedAt: SAMPLE_CREATED_AT,
  },
];
