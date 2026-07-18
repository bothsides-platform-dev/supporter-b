import { describe, it, expect } from 'vitest';
import { buildSubmittedSummaryRows } from '../buildSubmittedSummaryRows';
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';

const rfp: RFP = {
  id: 'r1',
  code: 'P-2604-0001',
  buyerWsId: 'ws-b',
  title: '테스트 RFP',
  memo: '',
  rfpFiles: [],
  allowedPgWorkspaceIds: [],
  requiredPaymentMethods: [],
  customPaymentMethods: [{ id: 'custom-1', label: '포인트결제' }],
  deadline: new Date('2026-07-01T00:00:00.000Z').toISOString(),
  status: 'sent',
  createdBy: 'u1',
  createdAt: new Date().toISOString(),
};

const bid: Bid = {
  id: 'b1',
  rfpId: 'r1',
  pgWsId: 'ws-pg',
  invitationId: 'inv1',
  settleCycle: 'D+1',
  settleLimit: 0,
  guaranteeInsurance: 0,
  signupFee: 0,
  // card 는 구간 요율(TierRates), 'custom-1' 은 커스텀 단일 요율.
  paymentFees: { card: { sole: 1.5 } },
  customFees: { 'custom-1': 2 },
  proposalPdfs: [],
  status: 'submitted',
  submittedBy: 'pg-u',
  round: 1,
};

describe('buildSubmittedSummaryRows', () => {
  it('rfp·bid 를 라벨/값 행으로 변환한다 (구간·커스텀 수수료 포함)', () => {
    const rows = buildSubmittedSummaryRows(rfp, bid);
    const map = new Map(rows);
    expect(map.get('견적 요청 번호')).toBe('P-2604-0001');
    expect(map.get('제목')).toBe('테스트 RFP');
    expect(map.get('정산 주기')).toBe('D+1');
    // 구간 수수료: card 의 sole 구간이 '카드 (영세)' 로 펼쳐진다.
    expect(rows.some(([k]) => k === '카드 (영세)')).toBe(true);
    // 커스텀 수수료 라벨이 행으로.
    expect(rows.some(([k]) => k === '포인트결제')).toBe(true);
  });

  it('정액(건당) 수단은 % 가 아니라 "건당" 라벨 + 원 금액으로 표기한다', () => {
    const flatBid: Bid = { ...bid, paymentFees: { virtual_account: 300 } };
    const map = new Map(buildSubmittedSummaryRows(rfp, flatBid));
    expect(map.get('가상계좌 (건당)')).toBe('300원');
    expect(map.has('가상계좌')).toBe(false);
  });
});
