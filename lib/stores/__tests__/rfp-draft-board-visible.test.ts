import { beforeEach, describe, expect, it } from 'vitest';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

beforeEach(() => {
  useRfpDraftStore.getState().reset();
});

describe('rfp-draft store — 오픈 게시판 노출 필드', () => {
  it('boardVisible 초기값은 노출(true)이다', () => {
    expect(useRfpDraftStore.getState().boardVisible).toBe(true);
  });

  it('setField로 boardVisible을 false로 변경할 수 있다', () => {
    useRfpDraftStore.getState().setField('boardVisible', false);
    expect(useRfpDraftStore.getState().boardVisible).toBe(false);
  });

  it('reset() 후 boardVisible은 다시 true로 초기화된다', () => {
    useRfpDraftStore.getState().setField('boardVisible', false);
    useRfpDraftStore.getState().reset();
    expect(useRfpDraftStore.getState().boardVisible).toBe(true);
  });
});
