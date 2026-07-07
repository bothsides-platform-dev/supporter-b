'use client';

import { useEffect } from 'react';
import { createJSONStorage } from 'zustand/middleware';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

// 데모가 흘리는 쓰기를 버리는 no-op 스토리지 — persist를 무력화해 실제 localStorage
// draft(`support-b-rfp-draft`)를 건드리지 않게 한다.
const noopStorage = createJSONStorage(() => ({
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}));

// 랜딩 데모가 실제 RfpCreateWizard를 구동할 때 공유 draft store를 경량 격리한다.
// 마운트 시: 방문자의 실제 draft를 스냅샷 → persist 무력화 → reset(빈 상태로 시작).
// 언마운트 시: persist 원복 → 실제 draft 복원.
export function useIsolatedRfpDraft(): void {
  useEffect(() => {
    const store = useRfpDraftStore;
    const snapshot = store.getState(); // 불변 state 참조 — reset 이후에도 이전 값 유지.
    const originalStorage = store.persist.getOptions().storage;

    store.persist.setOptions({ storage: noopStorage });
    snapshot.reset();

    return () => {
      store.persist.setOptions({ storage: originalStorage });
      store.setState(snapshot);
    };
  }, []);
}
