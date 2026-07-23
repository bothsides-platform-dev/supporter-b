'use client';

// buyer 튜토리얼(BuyerTutorialFlow)이 RfpCreateWizard를 재사용하는 동안, 사용자가
// 실제 /rfp-create에서 작성 중이던 draft(useRfpDraftStore, localStorage 영속)를
// 밟지 않도록 격리한다 — landing useIsolatedRfpDraft와 같은 persist 무력화 방식.
//
// 마운트 시: 실제 draft를 메모리에 스냅샷 → persist 스토리지를 no-op으로 교체 →
// 스토어를 튜토리얼 seed로 설정. 튜토리얼 동안의 모든 쓰기는 버려지므로
// localStorage('support-b-rfp-draft')는 끝까지 무접촉이다 — 탭 크래시·동시 탭
// 시나리오에서도 실제 draft가 소실/오염되지 않는다. (이전 sessionStorage 백업
// 방식은 탭 한정 백업이 죽으면 fixture가 영속 스토어에 남는 데이터 손실 결함 —
// 적대적 리뷰에서 발견되어 이 방식으로 교체.)
//
// 종료 시(restore/언마운트): 스냅샷 복원(persist 아직 no-op — LS 무접촉) → persist
// 원복 → rehydrate로 localStorage의 최신 영속 상태를 다시 읽는다(튜토리얼 동안
// 다른 탭이 실제 draft를 편집했어도 보존).
import { useEffect, useRef } from 'react';
import { createJSONStorage } from 'zustand/middleware';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import type { RfpDraftSeedFields } from '@/lib/onboarding/tutorial-fixtures';

const noopStorage = createJSONStorage(() => ({
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}));

export function useIsolatedRfpDraft(seed: RfpDraftSeedFields): { restore: () => void } {
  const restoreRef = useRef<() => void>(() => {});

  useEffect(() => {
    const store = useRfpDraftStore;
    const snapshot = store.getState(); // 불변 state 참조 — seed 교체 이후에도 이전 값 유지.
    const originalStorage = store.persist.getOptions().storage;
    let restored = false;

    store.persist.setOptions({ storage: noopStorage });
    store.setState(seed);

    restoreRef.current = () => {
      if (restored) return;
      restored = true;
      // noop storage가 아직 활성 — 스냅샷 복원이 localStorage를 건드리지 않는다.
      // (persist를 먼저 원복하면 이 setState가 LS를 스냅샷으로 덮어써, 아래
      // rehydrate가 방금 쓴 값을 되읽는 no-op이 된다.)
      store.setState(snapshot);
      store.persist.setOptions({ storage: originalStorage });
      // localStorage가 진실의 원천 — 튜토리얼 동안 다른 탭이 편집한 내용까지 반영.
      void store.persist.rehydrate();
    };

    return () => {
      restoreRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트/언마운트 1회성 격리 전환, seed는 최초값만 사용
  }, []);

  return { restore: () => restoreRef.current() };
}
