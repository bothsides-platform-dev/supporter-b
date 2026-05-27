import { beforeEach, describe, expect, it } from 'vitest';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

beforeEach(() => {
  useRfpDraftStore.getState().reset();
});

describe('rfp-draft store — solution 필드', () => {
  it('currentSolution 초기값은 빈 문자열이다', () => {
    expect(useRfpDraftStore.getState().currentSolution).toBe('');
  });

  it('currentSolutionDetail 초기값은 빈 문자열이다', () => {
    expect(useRfpDraftStore.getState().currentSolutionDetail).toBe('');
  });

  it('setField로 currentSolution을 변경할 수 있다', () => {
    useRfpDraftStore.getState().setField('currentSolution', 'cafe24');
    expect(useRfpDraftStore.getState().currentSolution).toBe('cafe24');
  });

  it('setField로 currentSolutionDetail을 변경할 수 있다', () => {
    useRfpDraftStore.getState().setField('currentSolutionDetail', 'ABC몰');
    expect(useRfpDraftStore.getState().currentSolutionDetail).toBe('ABC몰');
  });

  it('reset() 후 두 필드 모두 빈 문자열로 초기화된다', () => {
    useRfpDraftStore.getState().setField('currentSolution', 'self');
    useRfpDraftStore.getState().setField('currentSolutionDetail', 'ABC몰');
    useRfpDraftStore.getState().reset();
    expect(useRfpDraftStore.getState().currentSolution).toBe('');
    expect(useRfpDraftStore.getState().currentSolutionDetail).toBe('');
  });
});
