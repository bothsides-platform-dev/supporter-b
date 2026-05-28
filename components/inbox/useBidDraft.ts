'use client';

import { useRef, useState } from 'react';

export type BidDraft = {
  cycleUnit: 'D' | 'W' | 'M';
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  bankPct: string;
  cardPct: string;
  memo: string;
};

function draftKey(rfpId: string) {
  return `bid-draft:${rfpId}`;
}

function readDraft(rfpId: string): BidDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(rfpId));
    if (!raw) return null;
    return JSON.parse(raw) as BidDraft;
  } catch {
    localStorage.removeItem(draftKey(rfpId));
    return null;
  }
}

export function useBidDraft(rfpId: string) {
  const [draft] = useState<BidDraft | null>(() => readDraft(rfpId));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function saveDraft(d: BidDraft) {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      localStorage.setItem(draftKey(rfpId), JSON.stringify(d));
    }, 500);
  }

  function clearDraft() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    localStorage.removeItem(draftKey(rfpId));
  }

  return { draft, saveDraft, clearDraft };
}
