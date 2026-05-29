'use client';

import { useRef, useState } from 'react';

// __v 2: 결제수단 동적화로 bankPct/cardPct 고정 필드를 fees 맵으로 교체.
// 구버전 blob(bankPct/cardPct)은 fees가 없어 폼이 깨지므로 readDraft에서 폐기.
export type BidDraft = {
  __v: 2;
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
      (parsed as { __v?: unknown }).__v !== 2 ||
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
