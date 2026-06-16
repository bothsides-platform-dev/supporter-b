'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type DealRoomTab = 'counterparty' | 'team';

export type DealRoomCounterparty = {
  workspaceId: string;
  name: string;
  type: 'buyer' | 'pg';
};

type DealRoomContextValue = {
  // 포커스된 상대방 — 구매사 측은 FocusComparison 이, PG 측은 DealRoomChat 이 set.
  counterparty: DealRoomCounterparty | null;
  setCounterparty: (counterparty: DealRoomCounterparty | null) => void;
  tab: DealRoomTab;
  setTab: (tab: DealRoomTab) => void;
};

const DealRoomContext = createContext<DealRoomContextValue | null>(null);

// 한 딜룸 인스턴스로 스코프된 상태(상대방·탭). DealRoomShell 이 code 별로 마운트하므로
// (key={code}) 딜룸을 옮기면 상태가 깨끗이 초기화된다 — 전역 스토어의 누수 footgun 제거.
export function DealRoomProvider({ children }: { children: ReactNode }) {
  const [counterparty, setCounterparty] = useState<DealRoomCounterparty | null>(null);
  const [tab, setTab] = useState<DealRoomTab>('counterparty');
  const value = useMemo(
    () => ({ counterparty, setCounterparty, tab, setTab }),
    [counterparty, tab],
  );
  return <DealRoomContext.Provider value={value}>{children}</DealRoomContext.Provider>;
}

export function useDealRoom(): DealRoomContextValue {
  const ctx = useContext(DealRoomContext);
  if (!ctx) throw new Error('useDealRoom must be used within a DealRoomProvider');
  return ctx;
}
