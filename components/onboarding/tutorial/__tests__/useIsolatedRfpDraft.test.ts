import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import {
  useIsolatedRfpDraft,
  restoreOrphanedTutorialDraftBackup,
  TUTORIAL_DRAFT_BACKUP_KEY,
} from '../useIsolatedRfpDraft';
import type { RfpDraftSeedFields } from '@/lib/onboarding/tutorial-fixtures';

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

describe('useIsolatedRfpDraft', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetStoreToRealDraft();
  });
  afterEach(() => {
    sessionStorage.clear();
  });

  it('마운트 시 현재 draft를 백업하고 스토어를 seed로 교체한다', () => {
    renderHook(() => useIsolatedRfpDraft(seed));

    expect(useRfpDraftStore.getState().title).toBe('');
    expect(useRfpDraftStore.getState().websiteUrl).toBe('https://seed.example.com');

    const raw = sessionStorage.getItem(TUTORIAL_DRAFT_BACKUP_KEY);
    expect(raw).toBeTruthy();
    const backup = JSON.parse(raw!);
    expect(backup.title).toBe('실제 작성중이던 제목');
  });

  it('반환된 restore 함수 호출 시 백업값으로 되돌리고 sessionStorage 키를 제거한다', () => {
    const { result } = renderHook(() => useIsolatedRfpDraft(seed));

    result.current.restore();

    expect(useRfpDraftStore.getState().title).toBe('실제 작성중이던 제목');
    expect(useRfpDraftStore.getState().websiteUrl).toBe('https://real.example.com');
    expect(sessionStorage.getItem(TUTORIAL_DRAFT_BACKUP_KEY)).toBeNull();
  });

  it('명시적 restore 없이 언마운트해도 자동으로 복원된다', () => {
    const { unmount } = renderHook(() => useIsolatedRfpDraft(seed));
    unmount();

    expect(useRfpDraftStore.getState().title).toBe('실제 작성중이던 제목');
    expect(sessionStorage.getItem(TUTORIAL_DRAFT_BACKUP_KEY)).toBeNull();
  });

  it('restore를 두 번 호출해도 안전하다(멱등)', () => {
    const { result } = renderHook(() => useIsolatedRfpDraft(seed));
    result.current.restore();
    expect(() => result.current.restore()).not.toThrow();
    expect(useRfpDraftStore.getState().title).toBe('실제 작성중이던 제목');
  });
});

describe('restoreOrphanedTutorialDraftBackup (고아 스냅샷 가드)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    sessionStorage.clear();
  });

  it('백업 키가 없으면 아무 것도 하지 않는다', () => {
    resetStoreToRealDraft();
    const before = useRfpDraftStore.getState().title;
    restoreOrphanedTutorialDraftBackup();
    expect(useRfpDraftStore.getState().title).toBe(before);
  });

  it('백업 키가 남아있으면(튜토리얼 탭 강제 종료 등) 복원하고 키를 제거한다', () => {
    sessionStorage.setItem(
      TUTORIAL_DRAFT_BACKUP_KEY,
      JSON.stringify({ title: '오래된 실제 작성중 제목' }),
    );
    useRfpDraftStore.setState({ title: '튜토리얼 seed 잔재' });

    restoreOrphanedTutorialDraftBackup();

    expect(useRfpDraftStore.getState().title).toBe('오래된 실제 작성중 제목');
    expect(sessionStorage.getItem(TUTORIAL_DRAFT_BACKUP_KEY)).toBeNull();
  });
});
