// components/rfp/__tests__/wizard-validation.test.ts
import { describe, it, expect } from 'vitest';
import { getWizardValidity, getFirstIncompleteStep, type WizardValidationDraft } from '../wizard-validation';

const emptyDraft: WizardValidationDraft = {
  title: '',
  websiteUrl: '',
  contractType: null,
  mainProducts: '',
  annualPgVolume: '',
  requiredPaymentMethods: [],
  customPaymentMethods: [],
  allowedPgWorkspaceIds: [],
  deadline: '',
};

// Step 2 필수 3종(견적 유형·주요 판매 상품·연간 거래액)을 모두 채운 값.
const step2Extras = {
  contractType: 'new' as const,
  mainProducts: '의류',
  annualPgVolume: '1000000000',
};

function complete(draft: WizardValidationDraft) {
  return Object.fromEntries(getWizardValidity(draft).map((s) => [s.num, s.complete]));
}

describe('getWizardValidity', () => {
  it('빈 draft에서는 Step 1만 complete이고 2·3·4는 incomplete이다', () => {
    expect(complete(emptyDraft)).toEqual({ 1: true, 2: false, 3: false, 4: false });
  });

  it('제목을 채우면 Step 2가 complete이 된다', () => {
    expect(complete({ ...emptyDraft, ...step2Extras, title: '제안건', websiteUrl: 'https://x.com', requiredPaymentMethods: ['card'] })[2]).toBe(true);
  });

  it('공백뿐인 제목은 Step 2를 complete으로 보지 않는다', () => {
    expect(complete({ ...emptyDraft, title: '   ' })[2]).toBe(false);
  });

  it('제목이 있어도 홈페이지 주소 형식이 틀리면 Step 2는 incomplete이다', () => {
    expect(complete({ ...emptyDraft, title: '제안건', websiteUrl: 'abc', requiredPaymentMethods: ['card'] })[2]).toBe(false);
  });

  it('제목이 있고 홈페이지가 유효한 도메인이면 Step 2는 complete이다', () => {
    expect(
      complete({ ...emptyDraft, ...step2Extras, title: '제안건', websiteUrl: 'https://x.com', requiredPaymentMethods: ['card'] })[2],
    ).toBe(true);
  });

  it('PG를 1개 이상 추가하면 Step 3가 complete이 된다', () => {
    expect(
      complete({ ...emptyDraft, allowedPgWorkspaceIds: [{ id: 'pg-1' }] })[3],
    ).toBe(true);
  });

  it('유효한 마감일을 채우면 Step 4가 complete이 된다', () => {
    expect(complete({ ...emptyDraft, deadline: '2026-06-30T23:59:59Z' })[4]).toBe(true);
  });

  it('잘못된 마감일 문자열은 Step 4를 complete으로 보지 않는다', () => {
    expect(complete({ ...emptyDraft, deadline: 'not-a-date' })[4]).toBe(false);
  });

  it('각 step은 다른 step의 입력값과 무관하게 독립적으로 판정된다 (PG만 채워도 Step 3만 complete)', () => {
    const draft: WizardValidationDraft = {
      ...emptyDraft,
      allowedPgWorkspaceIds: [{ id: 'pg-1' }],
    };
    expect(complete(draft)).toEqual({ 1: true, 2: false, 3: true, 4: false });
  });
});

describe('getFirstIncompleteStep', () => {
  it('빈 draft에서는 첫 미충족 step인 Step 2(제목)를 반환한다', () => {
    const result = getFirstIncompleteStep(emptyDraft);
    expect(result?.num).toBe(2);
    expect(result?.hint).toContain('제목');
  });

  it('제목·PG만 채우면 첫 미충족 step은 Step 4(마감일)이다 — 순서와 무관', () => {
    const draft: WizardValidationDraft = {
      ...step2Extras,
      title: '제안건',
      websiteUrl: 'https://x.com',
      requiredPaymentMethods: ['card'],
      customPaymentMethods: [],
      allowedPgWorkspaceIds: [{ id: 'pg-1' }],
      deadline: '',
    };
    const result = getFirstIncompleteStep(draft);
    expect(result?.num).toBe(4);
    expect(result?.hint).toContain('마감일');
  });

  it('PG만 채운 경우에도 첫 미충족 step은 Step 2(제목)이다', () => {
    const draft: WizardValidationDraft = {
      ...emptyDraft,
      allowedPgWorkspaceIds: [{ id: 'pg-1' }],
    };
    expect(getFirstIncompleteStep(draft)?.num).toBe(2);
  });

  it('제목은 있으나 홈페이지 형식이 틀리면 Step 2를 반환하고 hint에 홈페이지를 안내한다', () => {
    const result = getFirstIncompleteStep({ ...emptyDraft, title: '제안건', websiteUrl: 'abc', requiredPaymentMethods: ['card'] });
    expect(result?.num).toBe(2);
    expect(result?.hint).toContain('홈페이지');
  });

  it('모든 필수값을 채우면 null을 반환한다', () => {
    const draft: WizardValidationDraft = {
      ...step2Extras,
      title: '제안건',
      websiteUrl: 'https://x.com',
      requiredPaymentMethods: ['card'],
      customPaymentMethods: [],
      allowedPgWorkspaceIds: [{ id: 'pg-1' }],
      deadline: '2026-06-30T23:59:59Z',
    };
    expect(getFirstIncompleteStep(draft)).toBeNull();
  });
});

describe('wizard-validation Step 2 필수 (SSOT 리팩터)', () => {
  const base: WizardValidationDraft = {
    title: '견적 요청',
    websiteUrl: 'example.com',
    contractType: 'new',
    mainProducts: '의류',
    annualPgVolume: '1000000000',
    requiredPaymentMethods: ['card'],
    customPaymentMethods: [],
    allowedPgWorkspaceIds: [{ id: 'pg1' }],
    deadline: '2099-01-01T23:59:59+09:00',
  };

  function step(draft: WizardValidationDraft, num: number) {
    return getWizardValidity(draft).find((s) => s.num === num)!;
  }

  it('모두 채우면 complete', () => {
    expect(step(base, 2).complete).toBe(true);
  });

  it('홈페이지 빈값이면 미완료 + 입력 안내', () => {
    const d = { ...base, websiteUrl: '' };
    expect(step(d, 2).complete).toBe(false);
    expect(step(d, 2).hint).toBe('홈페이지 주소를 입력해주세요');
  });

  it('홈페이지 형식 오류면 미완료 + 형식 안내', () => {
    const d = { ...base, websiteUrl: 'not a url' };
    expect(step(d, 2).complete).toBe(false);
    expect(step(d, 2).hint).toBe('홈페이지 주소 형식을 확인해주세요');
  });

  it('결제수단 누락이면 Step 2 미완료 (회귀)', () => {
    const d = { ...base, requiredPaymentMethods: [], customPaymentMethods: [] };
    expect(step(d, 2).complete).toBe(false);
    expect(step(d, 2).hint).toBe('견적 받을 결제수단을 1개 이상 선택해주세요');
  });

  it('제목 빈값이면 미완료 + 제목 안내', () => {
    const d = { ...base, title: '  ' };
    expect(step(d, 2).complete).toBe(false);
    expect(step(d, 2).hint).toBe('제목을 입력해주세요');
  });

  it('견적 유형 미선택이면 미완료 + 견적 유형 안내', () => {
    const d = { ...base, contractType: null };
    expect(step(d, 2).complete).toBe(false);
    expect(step(d, 2).hint).toBe('견적 유형을 선택해주세요');
  });

  it('주요 판매 상품 빈값이면 미완료 + 상품 안내', () => {
    const d = { ...base, mainProducts: '   ' };
    expect(step(d, 2).complete).toBe(false);
    expect(step(d, 2).hint).toBe('주요 판매 상품을 입력해주세요');
  });

  it('연간 PG 총 거래액 빈값이면 미완료 + 거래액 안내', () => {
    const d = { ...base, annualPgVolume: '' };
    expect(step(d, 2).complete).toBe(false);
    expect(step(d, 2).hint).toBe('전년도 연간 PG 총 거래액을 입력해주세요');
  });
});
