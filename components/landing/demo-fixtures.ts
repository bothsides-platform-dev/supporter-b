// 랜딩 데모가 실제 제품 컴포넌트(RfpCreateWizard · ImprovementSummary)를 구동하기 위한
// 고정 데이터. 실제 타입으로 선언해 제품 타입이 바뀌면 빌드가 깨지도록 한다(단일소스 가드).
import type { Bid } from '@/lib/types/bid';
import type { BizProfile } from '@/lib/types/biz-profile';
import type { PgWorkspace } from '@/components/rfp/RfpStep3PgSelect';
import type { CurrentConditions } from '@/components/rfp/comparison/ImprovementSummary';

// 마법사 step 1(사업자 확인)에 노출할 등록 사업자 — 데모에서 "연동된 상태"를 실제 테이블로 보여준다.
export const demoWorkspaceName = '서포트비';
export const fixtureBizProfile: Pick<BizProfile, 'bizNo' | 'taxType' | 'status'> = {
  bizNo: '205-88-01505',
  taxType: 'general',
  status: 'active',
};

// 마법사 step 3(PG 선택)에 노출할 PG 워크스페이스 목록.
export const fixturePgs: PgWorkspace[] = [
  { id: 'demo-pg-1', name: 'KG이니시스', displayName: 'KG이니시스', logoUpdatedAt: null },
  { id: 'demo-pg-2', name: 'NHN KCP', displayName: 'NHN KCP', logoUpdatedAt: null },
  { id: 'demo-pg-3', name: '헥토파이낸셜', displayName: '헥토파이낸셜', logoUpdatedAt: null },
  { id: 'demo-pg-4', name: '다날', displayName: '다날', logoUpdatedAt: null },
  { id: 'demo-pg-5', name: 'KICC(이지페이)', displayName: 'KICC(이지페이)', logoUpdatedAt: null },
  { id: 'demo-pg-6', name: '나이스페이먼츠', displayName: '나이스페이먼츠', logoUpdatedAt: null },
  { id: 'demo-pg-7', name: '토스페이먼츠', displayName: '토스페이먼츠', logoUpdatedAt: null },
];

// 자동재생 시 차례로 선택되는 PG (RfpStep3PgSelect의 칩 선택 연출용).
export const fixtureSelectedPgIds = ['demo-pg-1', 'demo-pg-6', 'demo-pg-7'];

// 딜룸 비교 hero(ImprovementSummary)에 들어갈 선정 후보 견적.
// 현재 조건 대비 모든 지표가 개선되어 "지금 조건보다 이만큼 좋아져요" 헤더가 유지된다.
export const fixtureBid: Bid = {
  id: 'demo-bid-1',
  rfpId: 'demo-rfp-1',
  pgWsId: 'demo-pg-7',
  invitationId: 'demo-inv-1',
  settleCycle: 'D+1',
  settleLimit: 1_000_000_000,
  guaranteeInsurance: 0,
  paymentFees: { card: 0.022 },
  customFees: {},
  proposalPdfs: [],
  status: 'submitted',
  submittedBy: 'demo-user-1',
  round: 1,
};

// 구매사의 현재(계약) 조건 — 비교 기준선. 모든 지표가 fixtureBid보다 불리하다.
export const fixtureCurrent: CurrentConditions = {
  feeRate: '3.4%',
  settlementCycle: 'D+2',
  settlementLimit: '5억',
  guaranteeInsurance: '1,200,000원',
};
