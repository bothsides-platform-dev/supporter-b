'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

// __v 3: 카드·간편결제 구간화로 fees 키에 "<method>:<tier>" 복합 키 도입.
import { type BidDraft } from '@/lib/quote/bid-draft';
export { type BidDraft, EMPTY_BID_DRAFT } from '@/lib/quote/bid-draft';

// '' 와 '0' 을 동일한 "빈 값"으로 본다 (CurrencyInput 마운트 churn 방어).
const normNum = (s: string) => s;

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
 * true 이면 "복원할 만한 내용 없음" → 자동 복원 안내/초기화 노출을 건너뛴다.
 */
export function isPristineDraft(d: BidDraft, baseline: BidDraft): boolean {
  return (
    JSON.stringify(d.conditionStates ?? {}) === JSON.stringify(baseline.conditionStates ?? {}) &&
    d.cycleUnit === baseline.cycleUnit &&
    d.cycleNum === baseline.cycleNum &&
    normNum(d.settleLimit) === normNum(baseline.settleLimit) &&
    normNum(d.guaranteeInsurance) === normNum(baseline.guaranteeInsurance) &&
    normNum(d.signupFee) === normNum(baseline.signupFee) &&
    d.memo === baseline.memo &&
    (d.proposalChoice ?? 'remove') === (baseline.proposalChoice ?? 'remove') &&
    d.uploadedProposal?.id === baseline.uploadedProposal?.id &&
    (d.signingTemplateId ?? undefined) === (baseline.signingTemplateId ?? undefined) &&
    feesEqual(d.fees, baseline.fees)
  );
}

type DraftScope = { workspaceId: string; revisionId?: string };

function draftKey(rfpId: string, scope?: DraftScope) {
  return scope
    ? `bid-draft:${scope.workspaceId}:${rfpId}:${scope.revisionId ?? 'initial'}`
    : `bid-draft:${rfpId}`;
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

function readDraft(key: string, preserveOriginal = false): BidDraft | null {
  // SSR 가드: useState 초기화로 render 중에 호출되므로 서버엔 localStorage 가 없다.
  // 딜룸 모달이 BidWizard 를 SSR 하는 경로에서 ReferenceError 가 나던 것을 막는다
  // (catch 안의 removeItem 도 서버에선 재-throw 됐었다).
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    // shape 가드: 구버전(__v 없음/fees 없음) 또는 깨진 형태는 폐기.
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      ![3, 4].includes(Number((parsed as { __v?: unknown }).__v)) ||
      typeof (parsed as { fees?: unknown }).fees !== 'object' ||
      (parsed as { fees?: unknown }).fees === null
    ) {
      if (!preserveOriginal) localStorage.removeItem(key);
      return null;
    }
    // 가입비 도입 전 저장된 __v:3 드래프트는 signupFee 키가 없다 — 폐기하지 않고 백필한다.
    const draft = parsed as BidDraft;
    const currentStep = draft.currentStep;
    return {
      ...draft,
      signupFee: draft.signupFee ?? '0',
      ...(currentStep !== undefined
        ? {
            currentStep:
              Number.isInteger(currentStep) && currentStep >= 1 && currentStep <= 4
                ? currentStep
                : 1,
          }
        : {}),
    };
  } catch {
    try {
      if (!preserveOriginal) localStorage.removeItem(key);
    } catch {
      /* Storage can be unavailable. */
    }
    return null;
  }
}

export function useBidDraft(rfpId: string, scope?: DraftScope, enabled = true) {
  const key = draftKey(rfpId, scope);
  const [draft] = useState<BidDraft | null>(() => (enabled ? readDraft(key) : null));
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<BidDraft | null>(null);

  const flush = useCallback(
    (report = true) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      if (!pendingRef.current) return;
      try {
        localStorage.setItem(key, JSON.stringify(pendingRef.current));
        pendingRef.current = null;
        if (report) {
          setSavedAt(new Date());
          setSaveError(null);
        }
      } catch {
        if (report)
          setSaveError('이 브라우저에 초안을 저장하지 못했어요. 창을 닫기 전에 다시 저장해요.');
      }
    },
    [key],
  );

  const saveDraft = useCallback(
    (d: BidDraft) => {
      if (!enabled) return;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      pendingRef.current = d;
      timerRef.current = setTimeout(() => flush(), 500);
    },
    [flush, enabled],
  );

  function clearDraft() {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    try {
      localStorage.removeItem(key);
      setSavedAt(null);
      setSaveError(null);
    } catch {
      setSaveError('저장한 초안을 지우지 못했어요. 브라우저 저장 설정을 확인해요.');
    }
  }

  useEffect(() => {
    const onPageHide = () => flush(false);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      flush(false);
    };
  }, [flush, enabled]);

  return { draft, saveDraft, clearDraft, savedAt, saveError, retrySave: flush };
}

export function readLegacyBidDraft(rfpId: string, workspaceId: string, revisionId?: string) {
  return readDraft(draftKey(rfpId, { workspaceId, revisionId }), true) ?? readDraft(draftKey(rfpId), true);
}
