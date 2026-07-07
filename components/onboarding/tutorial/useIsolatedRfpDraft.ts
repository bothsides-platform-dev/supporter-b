'use client';

// buyer 튜토리얼(BuyerTutorialFlow)이 RfpCreateWizard를 재사용하는 동안, 사용자가
// 실제 /rfp-create에서 작성 중이던 draft(useRfpDraftStore, localStorage 영속)를
// 밟지 않도록 격리한다. 마운트 시 현재 draft를 sessionStorage에 백업하고 스토어를
// 튜토리얼 seed로 교체, 언마운트(또는 명시적 restore 호출) 시 백업을 되돌린다.
//
// 고아 스냅샷 가드: 튜토리얼 탭이 강제 종료되는 등 언마운트 cleanup이 못 돈 경우
// sessionStorage에 백업이 남을 수 있다 — restoreOrphanedTutorialDraftBackup()을
// 실제 작성 페이지(/rfp-create) 진입 시 호출해 방치된 실제 draft를 되살린다.
import { useEffect, useRef } from 'react';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import type { RfpDraftSeedFields } from '@/lib/onboarding/tutorial-fixtures';

export const TUTORIAL_DRAFT_BACKUP_KEY = 'tutorial-rfp-draft-backup';

function snapshotDraftFields(): RfpDraftSeedFields {
  const state = useRfpDraftStore.getState();
  return {
    title: state.title,
    websiteUrl: state.websiteUrl,
    mainProducts: state.mainProducts,
    annualPgVolume: state.annualPgVolume,
    currentFeeRate: state.currentFeeRate,
    currentSettlementLimit: state.currentSettlementLimit,
    currentGuaranteeInsurance: state.currentGuaranteeInsurance,
    currentSettlementCycle: state.currentSettlementCycle,
    deliveryServicePeriod: state.deliveryServicePeriod,
    currentSolution: state.currentSolution,
    currentSolutionDetail: state.currentSolutionDetail,
    memo: state.memo,
    rfpFiles: state.rfpFiles,
    allowedPgWorkspaceIds: state.allowedPgWorkspaceIds,
    requiredPaymentMethods: state.requiredPaymentMethods,
    customPaymentMethods: state.customPaymentMethods,
    deadline: state.deadline,
    boardVisible: state.boardVisible,
    currentFeeVisibleToPg: state.currentFeeVisibleToPg,
    contractType: state.contractType,
    pgSelectionInitialized: state.pgSelectionInitialized,
  };
}

/**
 * 고아 스냅샷 가드 — 백업 키가 남아 있으면(튜토리얼 비정상 종료) 그 값으로 스토어를
 * 복원하고 키를 지운다. 없으면 아무 것도 하지 않는다. 실제 작성 페이지(/rfp-create)
 * 마운트 시 호출한다.
 */
export function restoreOrphanedTutorialDraftBackup(): void {
  if (typeof window === 'undefined') return;
  const raw = sessionStorage.getItem(TUTORIAL_DRAFT_BACKUP_KEY);
  if (!raw) return;
  sessionStorage.removeItem(TUTORIAL_DRAFT_BACKUP_KEY);
  try {
    const backup = JSON.parse(raw) as Partial<RfpDraftSeedFields>;
    useRfpDraftStore.setState(backup);
  } catch {
    // 손상된 백업은 조용히 버린다 — 복원 실패가 튜토리얼/작성 페이지를 막으면 안 된다.
  }
}

export function useIsolatedRfpDraft(seed: RfpDraftSeedFields): { restore: () => void } {
  const restoredRef = useRef(false);

  const restore = () => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const raw = sessionStorage.getItem(TUTORIAL_DRAFT_BACKUP_KEY);
    sessionStorage.removeItem(TUTORIAL_DRAFT_BACKUP_KEY);
    if (raw) {
      try {
        useRfpDraftStore.setState(JSON.parse(raw) as Partial<RfpDraftSeedFields>);
      } catch {
        // 손상된 백업은 조용히 버린다.
      }
    }
  };

  // components/landing/useIsolatedRfpDraft.ts(랜딩 데모)와 동일 컨벤션 — 마운트
  // effect에서 스냅샷+교체, 언마운트 cleanup에서 복원. RfpCreateWizard(자식)의 자체
  // mount effect(stale draft 정리 + restoreOrphanedTutorialDraftBackup 호출)가 이
  // 부모 effect보다 먼저 실행되므로, 남아있던 고아 백업을 자식이 먼저 정리한 뒤
  // 이 effect가 "정리된" 실제 draft를 스냅샷한다 — 순서가 우연이 아니라 의도된 체인.
  useEffect(() => {
    restoredRef.current = false;
    const backup = snapshotDraftFields();
    sessionStorage.setItem(TUTORIAL_DRAFT_BACKUP_KEY, JSON.stringify(backup));
    useRfpDraftStore.setState(seed);

    return () => {
      restore();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트/언마운트 1회성 격리 전환, seed는 최초값만 사용
  }, []);

  return { restore };
}
