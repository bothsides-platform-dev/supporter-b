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

  it('currentSolution=self + currentSolutionDetail 있는 v7 draft를 복원하면 migrate가 상세값을 비운다', async () => {
    // 자체개발 UI 변경 이전 저장된 draft(자체 개발 선택 + 독립몰 이름 입력됨)를 시뮬레이션.
    localStorage.setItem(
      'support-b-rfp-draft',
      JSON.stringify({
        state: { title: '복원된 견적', currentSolution: 'self', currentSolutionDetail: '독립몰이름' },
        version: 7,
      }),
    );
    await useRfpDraftStore.persist.rehydrate();
    expect(useRfpDraftStore.getState().currentSolution).toBe('self');
    expect(useRfpDraftStore.getState().currentSolutionDetail).toBe('');
    // blob을 실제로 읽었음을 증명 — title은 그대로 보존된다.
    expect(useRfpDraftStore.getState().title).toBe('복원된 견적');
    localStorage.removeItem('support-b-rfp-draft');
  });

  it('currentSolution=other + currentSolutionDetail 있는 v7 draft는 migrate 후에도 상세값이 유지된다', async () => {
    localStorage.setItem(
      'support-b-rfp-draft',
      JSON.stringify({
        state: { currentSolution: 'other', currentSolutionDetail: '자체몰' },
        version: 7,
      }),
    );
    await useRfpDraftStore.persist.rehydrate();
    expect(useRfpDraftStore.getState().currentSolution).toBe('other');
    expect(useRfpDraftStore.getState().currentSolutionDetail).toBe('자체몰');
    localStorage.removeItem('support-b-rfp-draft');
  });
});
