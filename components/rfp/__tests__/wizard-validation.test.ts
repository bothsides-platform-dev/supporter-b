// components/rfp/__tests__/wizard-validation.test.ts
import { describe, it, expect } from 'vitest';
import { getWizardValidity, getFirstIncompleteStep } from '../wizard-validation';

type Draft = {
  title: string;
  websiteUrl: string;
  allowedPgWorkspaceIds: { id: string; displayName: string }[];
  deadline: string;
  requiredPaymentMethods: string[];
  customPaymentMethods: { label: string }[];
};

const emptyDraft: Draft = {
  title: '',
  websiteUrl: '',
  allowedPgWorkspaceIds: [],
  deadline: '',
  requiredPaymentMethods: [],
  customPaymentMethods: [],
};

// Step 2 complete 판정에 결제수단이 추가됐으므로, 제목만 검증하려는
// 픽스처에는 결제수단 1개를 기본 포함시킨다.
const withPayment = { requiredPaymentMethods: ['card'] };

function complete(draft: Draft) {
  return Object.fromEntries(getWizardValidity(draft).map((s) => [s.num, s.complete]));
}

describe('getWizardValidity', () => {
  it('빈 draft에서는 Step 1만 complete이고 2·3·4는 incomplete이다', () => {
    expect(complete(emptyDraft)).toEqual({ 1: true, 2: false, 3: false, 4: false });
  });

  it('제목과 결제수단을 채우면 Step 2가 complete이 된다', () => {
    expect(complete({ ...emptyDraft, title: '제안건', ...withPayment })[2]).toBe(true);
  });

  it('공백뿐인 제목은 Step 2를 complete으로 보지 않는다', () => {
    expect(complete({ ...emptyDraft, title: '   ', ...withPayment })[2]).toBe(false);
  });

  it('제목이 있어도 홈페이지 주소 형식이 틀리면 Step 2는 incomplete이다', () => {
    expect(
      complete({ ...emptyDraft, title: '제안건', websiteUrl: 'abc', ...withPayment })[2],
    ).toBe(false);
  });

  it('제목이 있고 홈페이지가 유효한 도메인이면 Step 2는 complete이다', () => {
    expect(
      complete({ ...emptyDraft, title: '제안건', websiteUrl: 'https://x.com', ...withPayment })[2],
    ).toBe(true);
  });

  it('제목·홈페이지가 정상이어도 결제수단이 0개면 Step 2는 incomplete이다', () => {
    expect(
      complete({ ...emptyDraft, title: '제안건', websiteUrl: 'https://x.com' })[2],
    ).toBe(false);
  });

  it('requiredPaymentMethods를 1개 선택하면 Step 2가 complete이 된다', () => {
    expect(
      complete({ ...emptyDraft, title: '제안건', requiredPaymentMethods: ['card'] })[2],
    ).toBe(true);
  });

  it('customPaymentMethods만 1개여도 Step 2가 complete이 된다', () => {
    expect(
      complete({ ...emptyDraft, title: '제안건', customPaymentMethods: [{ label: '포인트결제' }] })[2],
    ).toBe(true);
  });

  it('PG를 1개 이상 추가하면 Step 3가 complete이 된다', () => {
    expect(
      complete({ ...emptyDraft, allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }] })[3],
    ).toBe(true);
  });

  it('유효한 마감일을 채우면 Step 4가 complete이 된다', () => {
    expect(complete({ ...emptyDraft, deadline: '2026-06-30T23:59:59Z' })[4]).toBe(true);
  });

  it('잘못된 마감일 문자열은 Step 4를 complete으로 보지 않는다', () => {
    expect(complete({ ...emptyDraft, deadline: 'not-a-date' })[4]).toBe(false);
  });

  it('각 step은 다른 step의 입력값과 무관하게 독립적으로 판정된다 (PG만 채워도 Step 3만 complete)', () => {
    const draft: Draft = {
      ...emptyDraft,
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }],
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

  it('제목·결제수단·PG만 채우면 첫 미충족 step은 Step 4(마감일)이다 — 순서와 무관', () => {
    const draft: Draft = {
      ...emptyDraft,
      title: '제안건',
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }],
      ...withPayment,
    };
    const result = getFirstIncompleteStep(draft);
    expect(result?.num).toBe(4);
    expect(result?.hint).toContain('마감일');
  });

  it('PG만 채운 경우에도 첫 미충족 step은 Step 2(제목)이다', () => {
    const draft: Draft = {
      ...emptyDraft,
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }],
    };
    expect(getFirstIncompleteStep(draft)?.num).toBe(2);
  });

  it('제목은 있으나 홈페이지 형식이 틀리면 Step 2를 반환하고 hint에 홈페이지를 안내한다', () => {
    const result = getFirstIncompleteStep({
      ...emptyDraft,
      title: '제안건',
      websiteUrl: 'abc',
      ...withPayment,
    });
    expect(result?.num).toBe(2);
    expect(result?.hint).toContain('홈페이지');
  });

  it('제목만 있고 결제수단이 0개면 Step 2를 반환하고 hint에 결제수단을 안내한다', () => {
    const result = getFirstIncompleteStep({ ...emptyDraft, title: '제안건' });
    expect(result?.num).toBe(2);
    expect(result?.hint).toContain('결제수단');
  });

  it('홈페이지 형식 오류와 결제수단 미선택이 동시면 홈페이지 hint가 결제수단보다 우선한다', () => {
    const result = getFirstIncompleteStep({ ...emptyDraft, title: '제안건', websiteUrl: 'abc' });
    expect(result?.num).toBe(2);
    expect(result?.hint).toContain('홈페이지');
  });

  it('모든 필수값을 채우면 null을 반환한다', () => {
    const draft: Draft = {
      ...emptyDraft,
      title: '제안건',
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스' }],
      deadline: '2026-06-30T23:59:59Z',
      ...withPayment,
    };
    expect(getFirstIncompleteStep(draft)).toBeNull();
  });
});
