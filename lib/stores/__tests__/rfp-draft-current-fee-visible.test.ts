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

  it('currentFeeVisibleToPg 없는 v5 draft를 복원하면 migrate가 노출(true)로 백필한다', async () => {
    // 진행 중이던 v5 draft(필드 없음, boardVisible=false)를 localStorage에 심는다.
    localStorage.setItem(
      'supporter-b-rfp-draft',
      JSON.stringify({ state: { title: '복원된 견적', boardVisible: false }, version: 5 }),
    );
    await useRfpDraftStore.persist.rehydrate();
    // 백필: 없던 필드는 노출(true)로 채워진다.
    expect(useRfpDraftStore.getState().currentFeeVisibleToPg).toBe(true);
    // blob을 실제로 읽었음을 증명 — boardVisible=false는 그대로 보존된다.
    expect(useRfpDraftStore.getState().boardVisible).toBe(false);
    localStorage.removeItem('supporter-b-rfp-draft');
  });
});
