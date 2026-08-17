// 낙찰 견적 → 계약서 수수료 표.
//
// 요율이 `결제수단 × 가맹점 등급` 행렬이라(`Bid.paymentFees` 는 `number | TierRates`,
// 가상계좌는 정액 원) 자유 텍스트 조항으로 쓰면 오기입이 곧 계약 오류다. 그래서
// 표는 조항 텍스트가 아니라 **견적 데이터에서** 만든다.

import { describe, it, expect } from 'vitest';
import { buildFeeTableRows } from '../fee-table';

describe('buildFeeTableRows', () => {
  it('소수 요율을 퍼센트로 옮긴다', () => {
    const rows = buildFeeTableRows({
      paymentFees: { card: 0.025 },
      customFees: {},
      customMethods: [],
    });
    expect(rows).toEqual([{ label: '카드', value: '2.50%' }]);
  });

  it('구간 요율은 한 셀에 등급 순서대로 편다', () => {
    const rows = buildFeeTableRows({
      paymentFees: { card: { sole: 0.005, sme1: 0.011, general: 0.025 } },
      customFees: {},
      customMethods: [],
    });
    expect(rows).toEqual([
      { label: '카드', value: '영세 0.50% · 중소1 1.10% · 일반 2.50%' },
    ]);
  });

  it('정액 수단은 건당 원으로 쓴다', () => {
    const rows = buildFeeTableRows({
      paymentFees: { virtual_account: 300 },
      customFees: {},
      customMethods: [],
    });
    expect(rows).toEqual([{ label: '가상계좌', value: '건당 300원' }]);
  });

  // 저장 순서(객체 키 순서)가 아니라 정해진 어휘 순서를 따라야 계약서 표가
  // 딜마다 뒤죽박죽이 되지 않는다.
  it('PAYMENT_METHODS 어휘 순서를 따른다 — 저장 순서가 아니다', () => {
    const rows = buildFeeTableRows({
      // 일부러 뒤섞어 넣는다
      paymentFees: { kakao_pay: 0.02, card: 0.025, bank_transfer: 0.013 },
      customFees: {},
      customMethods: [],
    });
    expect(rows.map((r) => r.label)).toEqual(['카드', '계좌이체', '카카오페이']);
  });

  it('견적에 없는 수단은 행을 만들지 않는다', () => {
    const rows = buildFeeTableRows({
      paymentFees: { card: 0.025 },
      customFees: {},
      customMethods: [],
    });
    expect(rows).toHaveLength(1);
  });

  it('커스텀 수단은 구매사가 붙인 라벨로 쓴다', () => {
    const rows = buildFeeTableRows({
      paymentFees: {},
      customFees: { cm1: 0.018 },
      customMethods: [{ id: 'cm1', label: '포인트 결제' }],
    });
    expect(rows).toEqual([{ label: '포인트 결제', value: '1.80%' }]);
  });

  it('라벨을 못 찾은 커스텀 수단은 행을 버리지 않는다', () => {
    // 조용히 버리면 계약서에 요율이 빠진 채 서명된다 — id 라도 남긴다.
    const rows = buildFeeTableRows({
      paymentFees: {},
      customFees: { orphan: 0.01 },
      customMethods: [],
    });
    expect(rows).toEqual([{ label: 'orphan', value: '1.00%' }]);
  });

  it('커스텀 수단은 표준 수단 뒤에 온다', () => {
    const rows = buildFeeTableRows({
      paymentFees: { card: 0.025 },
      customFees: { cm1: 0.018 },
      customMethods: [{ id: 'cm1', label: '포인트 결제' }],
    });
    expect(rows.map((r) => r.label)).toEqual(['카드', '포인트 결제']);
  });

  it('견적에 수수료가 하나도 없으면 빈 배열', () => {
    expect(
      buildFeeTableRows({ paymentFees: {}, customFees: {}, customMethods: [] }),
    ).toEqual([]);
  });
});
