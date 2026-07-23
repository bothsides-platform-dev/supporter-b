// buyer 튜토리얼 draft 격리 — persist 무력화 방식(landing useIsolatedRfpDraft 패턴).
// 핵심 계약: 튜토리얼 동안 localStorage('support-b-rfp-draft')는 절대 건드리지 않는다.
// 탭 크래시·동시 탭 시나리오에서도 실제 draft가 소실/오염되지 않는 것이 불변식이다
// (적대적 리뷰에서 발견된 sessionStorage 백업 방식의 데이터 손실 결함을 대체).
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { useIsolatedRfpDraft } from '../useIsolatedRfpDraft';
import type { RfpDraftSeedFields } from '@/lib/onboarding/tutorial-fixtures';

const LS_KEY = 'support-b-rfp-draft';
// persist 버전을 리터럴로 베끼지 않는다 — 스토어 버전이 오르면 구버전 blob 이 되어
// migrate 경로가 끼어들고, 의도한 순수 rehydrate 분기 커버리지가 조용히 사라진다.
const PERSIST_VERSION = useRfpDraftStore.persist.getOptions().version;

const seed: RfpDraftSeedFields = {
  title: '',
  websiteUrl: 'https://seed.example.com',
  mainProducts: '시드 상품',
  annualPgVolume: '1',
  currentFeeRate: '',
  currentSettlementLimit: '',
  currentGuaranteeInsurance: '',
  currentSettlementCycle: '',
  deliveryServicePeriod: '',
  currentSolution: '',
  currentSolutionDetail: '',
  memo: '',
  rfpFiles: [],
  allowedPgWorkspaceIds: [],
  requiredPaymentMethods: [],
  customPaymentMethods: [],
  deadline: '',
  boardVisible: true,
  currentFeeVisibleToPg: true,
  contractType: null,
  pgSelectionInitialized: false,
};

function resetStoreToRealDraft() {
  useRfpDraftStore.setState({
    title: '실제 작성중이던 제목',
    websiteUrl: 'https://real.example.com',
    mainProducts: '실제 상품',
    allowedPgWorkspaceIds: [{ id: 'real-pg', displayName: '실PG', logoUpdatedAt: null }],
  });
}

describe('useIsolatedRfpDraft (persist 무력화 격리)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetStoreToRealDraft();
    // 실제 draft가 localStorage에 영속돼 있는 상황을 재현.
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ state: { title: '실제 작성중이던 제목' }, version: PERSIST_VERSION }),
    );
  });

  it('마운트 시 스토어를 seed로 교체하되 localStorage의 실제 draft는 건드리지 않는다', () => {
    renderHook(() => useIsolatedRfpDraft(seed));

    expect(useRfpDraftStore.getState().mainProducts).toBe('시드 상품');
    // 불변식: 튜토리얼 seed가 영속 스토리지에 새어나가지 않는다.
    expect(localStorage.getItem(LS_KEY)).toContain('실제 작성중이던 제목');
    expect(localStorage.getItem(LS_KEY)).not.toContain('시드 상품');
  });

  it('튜토리얼 중의 스토어 편집도 localStorage에 기록되지 않는다 (persist 무력화)', () => {
    renderHook(() => useIsolatedRfpDraft(seed));

    useRfpDraftStore.getState().setField('title', '튜토리얼에서 입력한 제목');
    expect(localStorage.getItem(LS_KEY)).not.toContain('튜토리얼에서 입력한 제목');
  });

  it('restore 호출 시 스냅샷을 복원하고 persist를 재활성화한다', () => {
    const { result } = renderHook(() => useIsolatedRfpDraft(seed));

    useRfpDraftStore.getState().setField('title', '튜토리얼 제목');
    result.current.restore();

    expect(useRfpDraftStore.getState().title).toBe('실제 작성중이던 제목');
    // persist 재활성화 확인 — 이후 편집은 다시 localStorage에 기록된다.
    useRfpDraftStore.getState().setField('title', '복원 후 편집');
    expect(localStorage.getItem(LS_KEY)).toContain('복원 후 편집');
  });

  it('언마운트 시에도 복원된다 (restore 미호출 이탈 가드)', () => {
    const { unmount } = renderHook(() => useIsolatedRfpDraft(seed));

    useRfpDraftStore.getState().setField('title', '튜토리얼 제목');
    unmount();

    expect(useRfpDraftStore.getState().title).toBe('실제 작성중이던 제목');
  });

  it('restore는 멱등 — 두 번 호출해도 복원 상태가 유지된다', () => {
    const { result, unmount } = renderHook(() => useIsolatedRfpDraft(seed));

    result.current.restore();
    useRfpDraftStore.getState().setField('title', '복원 후 사용자 편집');
    unmount(); // cleanup의 restore가 다시 스냅샷을 덮어쓰면 안 된다.

    expect(useRfpDraftStore.getState().title).toBe('복원 후 사용자 편집');
  });

  it('restore()는 튜토리얼 동안 다른 탭이 편집한 localStorage 최신값을 반영한다', () => {
    const { result } = renderHook(() => useIsolatedRfpDraft(seed));

    // 튜토리얼 동안 다른 탭이 실제 draft를 편집한 상황. version 은 스토어 현재
    // 버전에서 파생 — 낮으면 migrate 경로가 끼어들어 검증이 흐려진다.
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ state: { title: '다른 탭이 편집한 제목' }, version: PERSIST_VERSION }),
    );
    result.current.restore();

    expect(useRfpDraftStore.getState().title).toBe('다른 탭이 편집한 제목');
  });

  it('localStorage가 비어 있으면 restore()는 스냅샷을 유지한다', () => {
    const { result } = renderHook(() => useIsolatedRfpDraft(seed));

    localStorage.removeItem(LS_KEY);
    result.current.restore();

    expect(useRfpDraftStore.getState().title).toBe('실제 작성중이던 제목');
  });
});
