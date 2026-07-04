import { beforeEach, describe, expect, it } from 'vitest';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

beforeEach(() => {
  useRfpDraftStore.getState().reset();
});

describe('rfp-draft store — PG 기본 전체선택 초기화 플래그', () => {
  it('pgSelectionInitialized 초기값은 false다', () => {
    expect(useRfpDraftStore.getState().pgSelectionInitialized).toBe(false);
  });

  it('setField로 pgSelectionInitialized를 true로 변경할 수 있다', () => {
    useRfpDraftStore.getState().setField('pgSelectionInitialized', true);
    expect(useRfpDraftStore.getState().pgSelectionInitialized).toBe(true);
  });

  it('reset() 후 pgSelectionInitialized는 다시 false로 초기화된다', () => {
    useRfpDraftStore.getState().setField('pgSelectionInitialized', true);
    useRfpDraftStore.getState().reset();
    expect(useRfpDraftStore.getState().pgSelectionInitialized).toBe(false);
  });
});
