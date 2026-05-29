import { beforeEach, describe, expect, it } from 'vitest';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

beforeEach(() => {
  useRfpDraftStore.getState().reset();
});

describe('rfp-draft store — 결제수단 필드', () => {
  it('requiredPaymentMethods 초기값은 빈 배열이다', () => {
    expect(useRfpDraftStore.getState().requiredPaymentMethods).toEqual([]);
  });

  it('customPaymentMethods 초기값은 빈 배열이다', () => {
    expect(useRfpDraftStore.getState().customPaymentMethods).toEqual([]);
  });

  it('setField로 requiredPaymentMethods를 변경할 수 있다', () => {
    useRfpDraftStore.getState().setField('requiredPaymentMethods', ['card', 'bank_transfer']);
    expect(useRfpDraftStore.getState().requiredPaymentMethods).toEqual(['card', 'bank_transfer']);
  });

  it('setField로 customPaymentMethods를 변경할 수 있다', () => {
    useRfpDraftStore.getState().setField('customPaymentMethods', [{ label: '포인트결제' }]);
    expect(useRfpDraftStore.getState().customPaymentMethods).toEqual([{ label: '포인트결제' }]);
  });

  it('reset() 후 두 필드 모두 빈 배열로 초기화된다', () => {
    useRfpDraftStore.getState().setField('requiredPaymentMethods', ['card']);
    useRfpDraftStore.getState().setField('customPaymentMethods', [{ label: '문상' }]);
    useRfpDraftStore.getState().reset();
    expect(useRfpDraftStore.getState().requiredPaymentMethods).toEqual([]);
    expect(useRfpDraftStore.getState().customPaymentMethods).toEqual([]);
  });
});
