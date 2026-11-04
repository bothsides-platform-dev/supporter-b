// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRfpInputFromDraft, type RfpDraftData } from '../from-draft';

// 초안 → wire 입력 변환 규칙만 검증한다. 필드 목록 자체는 from-draft.ts 의
// 컴파일타임 키 분류 가드가 지키므로 여기서 매핑을 그대로 반복하지 않는다.
const base: RfpDraftData = {
  currentPgs: [{ pgWorkspaceId: null, name: '기존 PG' }],
  productInfo: { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: ['none'] },
  contentQuestion: 'website',
  title: '  2026 결제 인프라 견적  ',
  websiteUrl: ' example.com ',
  mainProducts: '',
  industryGroupId: '',
  industryMode: 'registered',
  customIndustryName: '',
  matchingRequestKey: '',
  monthlyAvgPgVolume: ' 100000000 ',
  currentFeeRate: '',
  currentSettlementLimit: '',
  currentGuaranteeInsurance: '',
  currentSettlementCycle: '',
  deliveryServicePeriod: '3일',
  currentSolution: '',
  currentSolutionDetail: '',
  memo: '   ',
  rfpFiles: [{ id: 'file-1', name: 'a.pdf', size: 10 }],
  allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: 'PG 1', logoUpdatedAt: null }],
  requiredPaymentMethods: ['card'],
  customPaymentMethods: [{ label: '포인트' }],
  deadline: '2026-12-01T00:00:00.000Z',
  deadlineChoice: { mode: 'date' },
  boardVisible: true,
  currentFeeVisibleToPg: false,
  contractType: 'renewal',
  pgSelectionInitialized: true,
};
const submission = { requestKey: 'key-1', rfpAttachmentIds: ['att-1'] };

describe('createRfpInputFromDraft', () => {
  it('trims text and drops empty strings; the title stays as a trimmed string', () => {
    const input = createRfpInputFromDraft(base, submission);
    expect(input.title).toBe('2026 결제 인프라 견적');
    expect(input.websiteUrl).toBe('example.com');
    expect(input.monthlyAvgPgVolume).toBe('100000000');
    expect(input.mainProducts).toBeUndefined();
    expect(input.memo).toBeUndefined();
    expect(input.currentSolutionDetail).toBeUndefined();
  });

  it('forwards submission-time values, always sends, and omits absent draft links', () => {
    const linked = createRfpInputFromDraft(base, {
      ...submission,
      guestDraft: { id: 'guest-1', revision: 2 },
      journeyDraftId: 'journey-1',
    });
    expect(linked).toMatchObject({
      send: true,
      requestKey: 'key-1',
      rfpAttachmentIds: ['att-1'],
      allowedPgWorkspaceIds: ['pg-1'],
      guestDraft: { id: 'guest-1', revision: 2 },
      journeyDraftId: 'journey-1',
    });
    const plain = createRfpInputFromDraft(base, submission);
    expect('guestDraft' in plain).toBe(false);
    expect('journeyDraftId' in plain).toBe(false);
  });

  it('sends current PGs only for renewal contracts', () => {
    expect(createRfpInputFromDraft(base, submission).currentPgs).toEqual(base.currentPgs);
    const renewed = createRfpInputFromDraft({ ...base, contractType: 'new' }, submission);
    expect(renewed.currentPgs).toEqual([]);
    expect(renewed.contractType).toBe('new');
    expect(createRfpInputFromDraft({ ...base, contractType: null }, submission).contractType).toBeUndefined();
  });

  it('narrows the current solution to known values', () => {
    expect(createRfpInputFromDraft({ ...base, currentSolution: 'cafe24' }, submission).currentSolution).toBe('cafe24');
    expect(createRfpInputFromDraft({ ...base, currentSolution: 'unknown' }, submission).currentSolution).toBeUndefined();
  });

  it('maps the industry selection by mode', () => {
    expect(createRfpInputFromDraft({ ...base, industryGroupId: 'group-1' }, submission)).toMatchObject({
      industryGroupId: 'group-1',
    });
    const custom = createRfpInputFromDraft(
      { ...base, industryMode: 'custom', customIndustryName: '수제 가구' },
      submission,
    );
    expect(custom.customIndustryName).toBe('수제 가구');
    expect('industryGroupId' in custom).toBe(false);
  });

  it('rejects a draft whose product info is incomplete', () => {
    expect(() => createRfpInputFromDraft({ ...base, productInfo: {} }, submission)).toThrow();
  });
});
