import { describe, expect, it } from 'vitest';
import {
  buildAgreementFees,
  AgreementPartiesSchema,
  AgreementRatesSchema,
  buildAgreementDocument,
} from '../agreement';

describe('공통 장기합의서', () => {
  it('소수 셋째 자리 이후의 선정 요율도 계약서에서 반올림하지 않는다', () => {
    expect(
      buildAgreementFees(
        {
          paymentFees: { bank_transfer: 0.01875 },
          customFees: {},
          customMethods: [],
        },
        [{ key: 'bank_transfer', rate: 0.02 }],
      ),
    ).toEqual({
      ok: true,
      rows: [
        {
          label: '계좌이체',
          standard: '2.00%',
          discount: '0.125%p',
          value: '1.875%',
        },
      ],
    });
  });
  it('선정 요율을 그대로 유지하고 등급별 할인 폭을 계산한다', () => {
    const result = buildAgreementFees(
      {
        paymentFees: {
          card: { sole: 0.0097, general: 0.0235 },
          virtual_account: 250,
        },
        customFees: {},
        customMethods: [],
      },
      [
        { key: 'card:sole', rate: 0.015 },
        { key: 'card:general', rate: 0.034 },
        { key: 'virtual_account', rate: 300 },
      ],
    );
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          label: '카드 · 영세',
          standard: '1.50%',
          discount: '0.53%p',
          value: '0.97%',
        },
        {
          label: '카드 · 일반',
          standard: '3.40%',
          discount: '1.05%p',
          value: '2.35%',
        },
        {
          label: '가상계좌',
          standard: '300원/건',
          discount: '50원/건',
          value: '250원/건',
        },
      ],
    });
  });
  it('표준 요율 누락·역전·빈 견적을 조용히 통과시키지 않는다', () => {
    const input = {
      paymentFees: { bank_transfer: 0.02 },
      customFees: {},
      customMethods: [],
    };
    expect(buildAgreementFees(input, [])).toMatchObject({
      ok: false,
      error: 'AGREEMENT_RATES_MISSING',
    });
    expect(buildAgreementFees(input, [{ key: 'bank_transfer', rate: 0.01 }])).toMatchObject({
      ok: false,
      error: 'AGREEMENT_RATE_BELOW_QUOTE',
    });
    expect(buildAgreementFees({ ...input, paymentFees: {} }, [])).toMatchObject({
      ok: false,
      error: 'AGREEMENT_FEES_EMPTY',
    });
  });
  it('커스텀 결제수단도 생략하지 않고 이름에 연결한 표준 요율을 요구한다', () => {
    const input = {
      paymentFees: {},
      customFees: { c1: 0.01 },
      customMethods: [{ id: 'c1', label: '포인트' }],
    };
    expect(buildAgreementFees(input, [{ key: 'custom:포인트', rate: 0.02 }])).toMatchObject({
      ok: true,
      rows: [{ label: '포인트', value: '1.00%' }],
    });
    expect(buildAgreementFees({ ...input, customMethods: [] }, [])).toMatchObject({ ok: false });
  });
  it('입력 경계는 회사 정보만 허용하고 요율·본문 주입을 거부한다', () => {
    const party = {
      company: '주식회사 구매',
      bizNo: '1234567890',
      address: '서울시 강남구',
      representative: '김대표',
    };
    expect(AgreementPartiesSchema.safeParse({ buyer: party, pg: party }).success).toBe(true);
    expect(
      AgreementPartiesSchema.safeParse({
        buyer: party,
        pg: party,
        paymentFees: {},
      }).success,
    ).toBe(false);
    expect(AgreementRatesSchema.safeParse([{ key: 'bank_transfer', rate: -1 }]).success).toBe(
      false,
    );
    expect(AgreementRatesSchema.safeParse([{ key: 'bank_transfer', rate: 2 }]).success).toBe(false);
    expect(AgreementRatesSchema.safeParse([{ key: 'virtual_account', rate: 1.5 }]).success).toBe(
      false,
    );
    expect(
      AgreementRatesSchema.safeParse([
        { key: 'card:sole', rate: 0.01 },
        { key: 'card:sole', rate: 0.02 },
      ]).success,
    ).toBe(false);
  });
  it('회사명을 고정 본문에 반영하고 사진 속 실제 회사나 요율은 사용하지 않는다', () => {
    const doc = buildAgreementDocument('구매회사', '결제회사');
    expect(doc.preamble).toContain('구매회사');
    expect(doc.preamble).toContain('결제회사');
    expect(
      doc.clauses
        .filter((c) => c.kind === 'text')
        .map((c) => c.body)
        .join('\n'),
    ).toContain('2년');
    expect(JSON.stringify(doc)).not.toContain('토스페이먼츠');
    expect(doc.clauses.filter((c) => c.kind === 'feeTable')).toHaveLength(1);
  });
});
