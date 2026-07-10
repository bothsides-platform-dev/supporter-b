'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

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

export const EMPTY_BID_DRAFT: BidDraft = {
  __v: 3,
  cycleUnit: 'D',
  cycleNum: '1',
  settleLimit: '0',
  guaranteeInsurance: '0',
  fees: {},
  memo: '',
};

// '' 와 '0' 을 동일한 "빈 값"으로 본다 (CurrencyInput 마운트 churn 방어).
const normNum = (s: string) => (s === '' ? '0' : s);

// 빈 문자열 fee 값은 입력이 아닌 것으로 본다.
function normalizeFees(fees: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fees)) if (v !== '') out[k] = v;
  return out;
}

function feesEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const na = normalizeFees(a);
  const nb = normalizeFees(b);
  const ka = Object.keys(na).sort();
  const kb = Object.keys(nb).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && na[k] === nb[k]);
}

/**
 * 초안이 baseline(위저드가 처음 열렸을 때 폼)과 의미상 동일한지.
 * true 이면 "복원할 만한 내용 없음" → 자동 복원/토스트/초기화 노출을 건너뛴다.
 */
export function isPristineDraft(d: BidDraft, baseline: BidDraft): boolean {
  return (
    d.cycleUnit === baseline.cycleUnit &&
    d.cycleNum === baseline.cycleNum &&
    normNum(d.settleLimit) === normNum(baseline.settleLimit) &&
    normNum(d.guaranteeInsurance) === normNum(baseline.guaranteeInsurance) &&
    d.memo === baseline.memo &&
    feesEqual(d.fees, baseline.fees)
  );
}

function draftKey(rfpId: string) {
  return `bid-draft:${rfpId}`;
}

/**
 * 특정 rfp의 저장된 초안을 즉시 제거한다 — pg 튜토리얼이 write phase 진입 전에
 * 과거 튜토리얼(타이핑 허용 시절)의 잔존 초안을 지워 initialDraft 시드가 항상
 * 이기게 한다(저장 초안은 baseline과 다르면 복원이 우선이므로).
 */
export function clearStoredBidDraft(rfpId: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(draftKey(rfpId));
}

function readDraft(rfpId: string): BidDraft | null {
  // SSR 가드: useState 초기화로 render 중에 호출되므로 서버엔 localStorage 가 없다.
  // 딜룸 모달이 BidWizard 를 SSR 하는 경로에서 ReferenceError 가 나던 것을 막는다
  // (catch 안의 removeItem 도 서버에선 재-throw 됐었다).
  if (typeof window === 'undefined') return null;
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
  // 디바운스 대기 중인(아직 쓰이지 않은) 드래프트. 언마운트 시 flush 대상.
  const pendingRef = useRef<BidDraft | null>(null);

  const saveDraft = useCallback((d: BidDraft) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    pendingRef.current = d;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pendingRef.current = null;
      localStorage.setItem(draftKey(rfpId), JSON.stringify(d));
      setSavedAt(new Date());
    }, 500);
  }, [rfpId]);

  function clearDraft() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    localStorage.removeItem(draftKey(rfpId));
  }

  // 언마운트 시 대기 타이머를 취소하고 미저장 드래프트를 동기 flush.
  // 타이머가 살아남으면 (테스트) 환경 teardown 뒤 발화해 localStorage
  // ReferenceError가 나고, (실사용) 모달을 빨리 닫으면 마지막 입력이 유실된다.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (pendingRef.current !== null) {
        localStorage.setItem(draftKey(rfpId), JSON.stringify(pendingRef.current));
        pendingRef.current = null;
      }
    };
  }, [rfpId]);

  return { draft, saveDraft, clearDraft, savedAt };
}
