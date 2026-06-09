'use client';

import { useRef, useState, useCallback } from 'react';

// __v 3: 카드·간편결제 구간화로 fees 키에 "<method>:<tier>" 복합 키 도입.
export type BidDraft = {
  __v: 3;
  cycleUnit: 'D' | 'W' | 'M';
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  // key: PaymentMethod | customId, value: 사용자가 입력한 "%" 문자열
  fees: Record<string, string>;
  memo: string;
};

function draftKey(rfpId: string) {
  return `bid-draft:${rfpId}`;
}

function readDraft(rfpId: string): BidDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(rfpId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    // shape 가드: 구버전(__v 없음/fees 없음) 또는 깨진 형태는 폐기.
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { __v?: unknown }).__v !== 3 ||
      typeof (parsed as { fees?: unknown }).fees !== 'object' ||
      (parsed as { fees?: unknown }).fees === null
    ) {
      localStorage.removeItem(draftKey(rfpId));
      return null;
    }
    return parsed as BidDraft;
  } catch {
    localStorage.removeItem(draftKey(rfpId));
    return null;
  }
}

export function useBidDraft(rfpId: string) {
  const [draft] = useState<BidDraft | null>(() => readDraft(rfpId));
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDraft = useCallback((d: BidDraft) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      localStorage.setItem(draftKey(rfpId), JSON.stringify(d));
      setSavedAt(new Date());
    }, 500);
  }, [rfpId]);

  function clearDraft() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    localStorage.removeItem(draftKey(rfpId));
  }

  return { draft, saveDraft, clearDraft, savedAt };
}
