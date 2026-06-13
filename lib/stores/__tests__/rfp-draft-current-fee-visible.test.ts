import { beforeEach, describe, expect, it } from 'vitest';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

beforeEach(() => {
  useRfpDraftStore.getState().reset();
});

describe('rfp-draft store — 현재 카드 수수료 PG 노출 필드', () => {
  it('currentFeeVisibleToPg 초기값은 노출(true)이다', () => {
    expect(useRfpDraftStore.getState().currentFeeVisibleToPg).toBe(true);
  });

  it('setField로 currentFeeVisibleToPg를 false로 변경할 수 있다', () => {
    useRfpDraftStore.getState().setField('currentFeeVisibleToPg', false);
    expect(useRfpDraftStore.getState().currentFeeVisibleToPg).toBe(false);
  });

  it('reset() 후 currentFeeVisibleToPg는 다시 true로 초기화된다', () => {
    useRfpDraftStore.getState().setField('currentFeeVisibleToPg', false);
    useRfpDraftStore.getState().reset();
    expect(useRfpDraftStore.getState().currentFeeVisibleToPg).toBe(true);
  });
});
