'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { trackFunnel } from '@/lib/analytics/funnel';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { publicInputClass } from '@/components/forms/inputs';
import { createRfpDraftStore } from '@/lib/stores/rfp-draft';
import { useIsLgUp } from '@/lib/hooks/useIsLgUp';
import { RESUME_PATH } from '@/lib/guest-rfp/draft';
import { guestRequest, type GuestRecommendation } from '@/lib/guest-rfp/requests-client';
import { saveGuestForSignup, saveGuestProgress } from '@/lib/guest-rfp/server-client';
import type { GuestQuoteController } from '@/lib/guest-rfp/quote-controller';
import { MatchingCandidates, MIN_MATCHING_LOADING_MS } from './RfpMatchingSelection';
import { MatchingReviewLayout, reviewBackPane, isReviewBackShortcut } from './MatchingReviewLayout';
import { RfpMatchingLoading } from './RfpMatchingLoading';
import { RequestSummary } from './RequestSummary';
import { BusinessPeriodButtons } from './BusinessDeadlinePicker';
import type { ReviewPane } from './RfpStep4Review';
import styles from './guest-quote.module.css';

export function GuestMatchingReview({ id, revision, workspaceId, quote, autoRequestEnabled, onBack, onEdit, onConfirm }: {
  id: string; revision: number; workspaceId: string; quote?: GuestQuoteController; autoRequestEnabled: boolean;
  onBack: () => void; onEdit?: (question: string) => void;
  onConfirm: (selection: { pgId: string; days: number; revision: number }) => Promise<void>;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const initialRevision = useRef(revision);
  const isLg = useIsLgUp();
  const [pane, setPane] = useState<ReviewPane>('pg');
  const [result, setResult] = useState<GuestRecommendation | null>(null);
  const [selected, setSelected] = useState('');
  const [days, setDays] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const generation = useRef(0);
  const locked = useRef(false);
  const resultRef = useRef<GuestRecommendation | null>(null);
  const read = useCallback(async (annualRevenue?: number | null, expectedRevision?: number) => {
    let currentRevision = resultRef.current?.revision ?? initialRevision.current;
    if (annualRevenue !== undefined && quote) {
      quote.update({ savings: { ...quote.snapshot().savings, annualRevenue: annualRevenue ?? undefined, response: undefined, inputKey: undefined } });
      currentRevision = (await saveGuestProgress(quote.session.draft, quote.session.save)).revision;
    }
    return guestRequest<GuestRecommendation>({ op: 'recommend', id,
      ...(workspaceId ? { workspaceId } : {}),
      ...(annualRevenue !== undefined || expectedRevision !== undefined ? { revision: expectedRevision ?? currentRevision, ...(!quote && annualRevenue !== undefined ? { annualRevenue } : {}) } : {}),
    });
  }, [id, workspaceId, quote]);
  const load = useCallback(async (annualRevenue?: number | null) => {
    const version = ++generation.current;
    setBusy(true); setError('');
    try {
      const response = await read(annualRevenue);
      if (version !== generation.current) return;
      resultRef.current = response;
      setResult(response);
      setSelected(previous => response.recommendation.candidates.some(pg => pg.pgWorkspaceId === previous) ? previous : '');
    } catch (cause) {
      if (version === generation.current) { setSelected(''); setError(cause instanceof Error ? cause.message : '추천 정보를 다시 확인해요.'); }
    } finally { if (version === generation.current) setBusy(false); }
  }, [read]);
  useEffect(() => {
    // This fetch lifecycle owns loading/error state and invalidates replies after unmount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generation is a request counter, not a DOM ref.
    return () => { ++generation.current; };
  }, [load]);
  useEffect(() => {
    const timers = [1000, 2000, 4700, MIN_MATCHING_LOADING_MS].map(ms => setTimeout(() => setElapsed(ms), ms));
    return () => timers.forEach(clearTimeout);
  }, []);
  const draft = useMemo(() => result ? createRfpDraftStore({ ...result.answers,
    rfpFiles: quote?.session.draft.files ?? result.files,
  }).getState() : null, [result, quote]);
  const loading = !error && (!result || elapsed < MIN_MATCHING_LOADING_MS);
  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ block: 'start' });
    rootRef.current?.focus({ preventScroll: true });
  }, [loading]);
  const canContinue = !busy && !error && !loading && !!selected
    && (result?.recommendation.risk === 'white' || result?.recommendation.risk === 'gray')
    && result.recommendation.candidates.some(pg => pg.pgWorkspaceId === selected);
  const back = () => {
    if (busy || locked.current) return;
    if (reviewBackPane(!isLg, pane)) setPane('pg'); else onBack();
  };
  const shortcut = (event: KeyboardEvent<HTMLElement>) => {
    if (isReviewBackShortcut(event)) { event.preventDefault(); back(); }
  };
  const confirm = async () => {
    if (!canContinue || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    trackFunnel('funnel_cta_click', { funnel_id: 'acquisition', step_id: 'choose_signup', entry_path: 'guest' });
    try {
      if (quote) await saveGuestForSignup(quote.session.draft, quote.session.save);
      // Recheck policy and revision after saving originals. The reservation also validates under its row lock.
      const expectedRevision = quote?.session.draft.serverRevision ?? resultRef.current?.revision ?? initialRevision.current;
      const latest = await read(undefined, expectedRevision);
      resultRef.current = latest; setResult(latest);
      if (!latest.recommendation.candidates.some(pg => pg.pgWorkspaceId === selected)) {
        setSelected(''); setPane('pg'); throw new Error('추천 기준이 바뀌었어요. PG사를 다시 선택해요.');
      }
      if (autoRequestEnabled) await onConfirm({ pgId: selected, days, revision: latest.revision });
      else router.push(`/signup/buyer?next=${encodeURIComponent(RESUME_PATH)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장을 완료하지 못했어요. 다시 시도해요.');
    } finally { locked.current = false; setBusy(false); }
  };
  return <div ref={rootRef} tabIndex={-1} className="outline-none" onKeyDown={event => {
    if (!(event.target instanceof HTMLElement) || event.target.closest('button, a, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="menu"], [role="option"]')) return;
    shortcut(event);
  }}>
    {error && <div role="alert" className="space-y-3 py-4"><p>{error}</p><Button variant="outlined" disabled={busy} onClick={() => void load()}>다시 확인해요</Button></div>}
    {loading ? <RfpMatchingLoading guest phase={elapsed < 1000 ? 0 : !result || elapsed < 2000 ? 1 : elapsed < 4700 ? 2 : 3} industryName={result?.recommendation.industryName || '선택한 업종'} /> : result && draft &&
      <fieldset disabled={busy} className="min-w-0">
        <MatchingReviewLayout pane={isLg ? undefined : pane} recommendation={<div className="space-y-5">
          <label className="block space-y-2"><span>{draft.contractType === 'new' ? '예상 연매출 구간' : '연매출 구간'} <span className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">(선택)</span></span>
            <select className={publicInputClass} aria-label={draft.contractType === 'new' ? '예상 연매출 구간' : '연매출 구간'} value={result.annualRevenue === null ? '' : [300000000, 500000000, 1000000000, 3000000000, 3000000001].find(max => result.annualRevenue! <= max) ?? 3000000001} onChange={event => void load(event.target.value ? Number(event.target.value) : null)}>
              <option value="">선택하지 않음</option>
              <option value="300000000">3억 원 이하</option><option value="500000000">3억 원 초과 ~ 5억 원 이하</option>
              <option value="1000000000">5억 원 초과 ~ 10억 원 이하</option><option value="3000000000">10억 원 초과 ~ 30억 원 이하</option><option value="3000000001">30억 원 초과</option>
            </select>
          </label>
          <MatchingCandidates recommendation={result.recommendation} selected={selected} onSelect={setSelected} estimated />
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">{result.tierBasis === 'confirmed' ? '확인된 회원 등급을 기준으로 안내해요.' : result.tierBasis === 'provisional' ? '입력한 연매출 구간으로 산정한 잠정 등급이에요.' : '매출 구간을 선택하면 예상 수수료를 확인할 수 있어요.'} 실제 요율은 PG 심사 후 확정해요.</p>
        </div>}>
          <div className="space-y-5">
            <div className="space-y-2"><h2 className="md-label-medium">응답 기간</h2><BusinessPeriodButtons value={days} onChange={setDays} />
              <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">실제 발송일 다음 날부터 계산해요. 응답 마감은 오후 6시예요.</p></div>
            <RequestSummary draft={draft} workspaceName={quote?.snapshot().companyName} bizProfile={quote ? { bizNo: quote.snapshot().bizNo } : undefined} industryName={result.recommendation.industryName} attachmentCount={result.attachmentCount}
              actions={<div className="mb-2 flex flex-wrap gap-2"><Button variant="text" onClick={onBack}>답변을 수정해요</Button>{onEdit && <><Button variant="text" onClick={() => onEdit('website')}>홈페이지 수정</Button><Button variant="text" onClick={() => onEdit('industry')}>업종 수정</Button><Button variant="text" onClick={() => onEdit('contract')}>계약 유형 수정</Button>{draft.contractType === 'renewal' && <Button variant="text" onClick={() => onEdit('current-pgs')}>현재 이용 중인 PG사 수정</Button>}</>}</div>} />
            {autoRequestEnabled ? <div className="space-y-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
              <p>이메일 인증과 입점 승인이 끝나면 선택한 PG사에 자동으로 보내요.</p>
              <p>계정에 연결한 날부터 30일 동안 유효해요. 보내기 전에는 취소할 수 있어요.</p>
            </div> : <><p>가입 후 사업자 정보를 확인하고 견적을 요청해요.</p>{!busy && <Link href={`/login?next=${encodeURIComponent(RESUME_PATH)}`}>기존 계정으로 로그인해요</Link>}</>}
          </div>
        </MatchingReviewLayout>
      </fieldset>}
    <div className={styles.reviewActions}>
      <Button variant="outlined" disabled={busy} onClick={back} onKeyDown={shortcut}>이전</Button>
      {!isLg && pane === 'pg' ? <Button disabled={!canContinue} onClick={() => setPane('review')} onKeyDown={shortcut}>다음</Button>
        : <Button disabled={!canContinue} onClick={() => void confirm()} onKeyDown={shortcut}>{busy ? '저장 중…' : autoRequestEnabled ? '선택한 PG사에 자동 요청하기' : '가입하고 이어갈게요'}</Button>}
    </div>
  </div>;
}
