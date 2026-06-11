'use client';

import { create } from 'zustand';

// 채팅 레일(상세 화면 우측 고정 패널)의 page→rail 슬롯 (header-actions 선례).
// RfpDetailContent는 RSC라 콜백 전달이 불가능하므로 FocusComparison('use
// client')이 포커스된 PG를 publish하고 ChatRail이 consume한다. 페이지 단위
// 상태 — 레일 unmount 시 reset() 필수 (다른 상세 페이지로의 누수 방지).

export type ChatRailTab = 'counterparty' | 'team';

export type ChatRailCounterparty = {
  workspaceId: string;
  name: string;
  type: 'buyer' | 'pg';
};

type ChatRailStore = {
  open: boolean;
  tab: ChatRailTab;
  counterparty: ChatRailCounterparty | null;
  setOpen: (open: boolean) => void;
  setTab: (tab: ChatRailTab) => void;
  setCounterparty: (counterparty: ChatRailCounterparty | null) => void;
  reset: () => void;
};

const INITIAL = {
  open: false,
  tab: 'counterparty' as ChatRailTab,
  counterparty: null,
};

export const useChatRailStore = create<ChatRailStore>((set) => ({
  ...INITIAL,
  setOpen: (open) => set({ open }),
  setTab: (tab) => set({ tab }),
  setCounterparty: (counterparty) => set({ counterparty }),
  reset: () => set(INITIAL),
}));
