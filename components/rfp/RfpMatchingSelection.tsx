'use client';
import { trackFunnel } from '@/lib/analytics/funnel';
import { useFunnelView } from '@/lib/analytics/use-funnel';
import { useBuyerDemo } from '@/lib/demo/buyer-demo-context';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MERCHANT_TIER_LABELS } from '@/lib/types/bid';
import type { ReviewPane } from './RfpStep4Review';
import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { RfpMatchingLoading } from './RfpMatchingLoading';
import { Button } from '@/components/primitives/Button';
import { Chip } from '@/components/primitives/Chip';
import { useRfpDraft, useRfpDraftApi } from '@/lib/stores/rfp-draft-context';
import { matchingBusinessAction, recommendPgAction } from '@/lib/server/actions/rfp/matching';
import { MATCHING_ERRORS, type Recommendation } from '@/lib/rfp/pg-matching';
import type { PgRecommendationGroup } from '@/lib/types/pg-recommendation';
import { cleanIndustryName } from '@/lib/rfp/industry-selection';
import { pgWordmark } from '@/lib/rfp/pg-wordmark';
import { siteConfig } from '@/lib/site-config';

// 공식 워드마크가 있으면 로고로, 없거나 불러오지 못하면 PG사 이름 텍스트로 보여준다.
function CandidateName({ name }: { name: string }) {
  const mark = pgWordmark(name);
  const [failed, setFailed] = useState(false);
  if (!mark || failed) return name;
  return (
    // 워드마크 글자가 진한 색이라 다크 모드에서도 흰 플레이트를 유지한다(로딩 화면 로고와 같은 정책).
    <span className="inline-flex h-10 w-[152px] shrink-0 items-center justify-center rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-white px-3">
      <Image src={mark.src} alt={name} width={mark.width} height={mark.height} unoptimized onError={() => setFailed(true)} className="h-6 w-auto max-w-[128px] object-contain" />
    </span>
  );
}

export function MatchingCandidates({ recommendation, selected, onSelect }: {
  recommendation: Recommendation;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { risk, candidates } = recommendation;
  const blocked = risk === 'black';
  const available = (risk === 'white' || risk === 'gray') && candidates.length > 0;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Chip label={blocked ? '접수 불가' : risk === 'gray' ? '추가 검토' : risk === 'white' ? '일반 업종' : '확인 필요'} color={blocked ? 'error' : risk === 'white' ? 'tertiary' : 'warning'} />
        <h3 className="text-[16px] font-semibold">{blocked ? '입력한 사업은 현재 신청을 진행하기 어려워요' : risk === 'gray' ? '입점 조건을 추가로 확인해야 해요' : available ? '사업에 맞는 PG사를 추천했어요' : '상담 가능한 PG사를 확인하고 있어요'}</h3>
        <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">{available ? '상담할 PG사 한 곳을 골라주세요. PG사 검토 후 받은 견적을 확인하고 최종 선정할 수 있어요.' : '입력한 업종을 다시 확인하거나 운영팀에 문의해주세요.'}</p>
      </div>
      {available ? <>
        <fieldset className="space-y-2">
          <legend className="sr-only">상담할 PG사</legend>
          {candidates.map((pg, index) => (
            <label data-coachmark={!selected && index === 0 ? "demo-pg-choice" : undefined} key={pg.pgWorkspaceId} className="flex cursor-pointer items-start gap-3 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] p-4 hover:bg-[var(--md-sys-color-surface-container-low)] has-[:checked]:border-[var(--md-sys-color-primary)]">
              <span className="flex h-10 shrink-0 items-center">
                <input type="radio" name="matching-pg" value={pg.pgWorkspaceId} checked={selected === pg.pgWorkspaceId} onChange={() => onSelect(pg.pgWorkspaceId)} className="accent-[var(--md-sys-color-primary)]" />
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                {/* 로고·이름 줄을 같은 40px 높이로 맞춰 두 종류 카드가 섞여도 라디오와 설명 시작 위치가 같다. */}
                <span className="flex min-h-10 flex-wrap items-center gap-2 font-semibold">
                  <CandidateName name={pg.name} />
                  {index === 0 && <Chip label="우선 추천" color="primary" />}
                </span>
                <span className="block text-[14px] text-[var(--md-sys-color-on-surface-variant)]">{pg.reason}</span>
                {pg.merchantTier && pg.feeRate != null
                  ? <span className="block pt-2 text-[14px]">{MERCHANT_TIER_LABELS[pg.merchantTier]} 판가 수수료 <span className="md-numeric font-semibold">{pg.feeRate}%</span></span>
                  : <span className="block pt-2 text-[14px]">수수료는 견적에서 안내해요</span>}
                {pg.feeNote && <span className="block text-[13px] text-[var(--md-sys-color-on-surface-variant)]">{pg.feeNote}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      </> : <a href={`mailto:${siteConfig.operator.email}`} className="inline-block text-[14px] text-[var(--md-sys-color-primary)] underline underline-offset-4">운영팀에 문의해요</a>}
    </div>
  );
}

type SelectionProps = { onBack?: () => void; children?: ReactNode; industryGroups?: PgRecommendationGroup[]; pane?: ReviewPane };

export const MIN_MATCHING_LOADING_MS = 10_000;

export function RfpMatchingSelection({ onBack, children, industryGroups = [], pane }: SelectionProps) {
  const industryGroupId = useRfpDraft(s => s.industryGroupId);
  const customIndustryName = useRfpDraft(s => s.industryMode === 'custom' ? s.customIndustryName : undefined);
  const industryName = customIndustryName === undefined
    ? industryGroups.find(group => group.id === industryGroupId)?.name ?? '업종'
    : cleanIndustryName(customIndustryName) || '업종';
  const contractType = useRfpDraft(s => s.contractType);
  const currentPgs = useRfpDraft(s => s.currentPgs);
  const [attempt, setAttempt] = useState(0);
  // A changed industry or retry owns a fresh request and presentation clock.
  return <MatchingRun key={JSON.stringify([industryGroupId, customIndustryName, contractType, contractType === 'renewal' ? currentPgs : [], attempt])} industryGroupId={industryGroupId} customIndustryName={customIndustryName} industryName={industryName} onBack={onBack} onRetry={() => setAttempt(a => a + 1)} pane={pane}>{children}</MatchingRun>;
}

function MatchingRun({ industryGroupId, customIndustryName, industryName, onBack, onRetry, children, pane }: SelectionProps & { industryGroupId: string; customIndustryName?: string; industryName: string; onRetry: () => void }) {
  const demo = useBuyerDemo();
  const draftApi = useRfpDraftApi();
  const selected = useRfpDraft(s => s.allowedPgWorkspaceIds[0]?.id ?? '');
  const [elapsed, setElapsed] = useState(0);
  const [state, setState] = useState<{ business?: boolean; result?: Recommendation; error?: string }>({});
  const paneRefs = useRef<Partial<Record<ReviewPane, HTMLElement | null>>>({});
  const previousPane = useRef(pane);
  const visibleResult = !demo && !state.error && !!state.result && elapsed >= MIN_MATCHING_LOADING_MS;
  const contractType = useRfpDraft(s => s.contractType);
  useFunnelView('request', visibleResult && pane !== 'review' ? 'recommendation' : null, { contract_type: contractType ?? 'unknown' });
  useFunnelView('request', visibleResult && pane !== 'pg' ? 'review' : null, { contract_type: contractType ?? 'unknown' });
  useEffect(() => {
    if (!demo && state.error) trackFunnel('funnel_step_error', { funnel_id: 'request', step_id: 'recommendation', error_code: state.error });
  }, [demo, state.error]);
  useEffect(() => {
    // 화면을 바꾼 뒤에만 새 화면의 처음으로 이동하고 초점을 옮긴다(첫 표시에서는 초점을 빼앗지 않는다).
    if (!pane || previousPane.current === pane) { previousPane.current = pane; return; }
    previousPane.current = pane;
    const target = paneRefs.current[pane];
    target?.scrollIntoView?.({ block: 'start' });
    target?.focus({ preventScroll: true });
  }, [pane]);
  useEffect(() => {
    let canceled = false;
    draftApi.getState().setField('allowedPgWorkspaceIds', []);
    // The presentation is a minimum duration, never a server progress percentage.
    const timers = [1000, 2000, 4700, MIN_MATCHING_LOADING_MS].map(ms => setTimeout(() => setElapsed(ms), ms));
    async function check() {
      try {
        const business = demo ? { ok: true as const, hasBusinessProfile: true } : await matchingBusinessAction();
        if (canceled) return;
        if (!business.ok) { setState({ error: business.error }); return; }
        setState({ business: business.hasBusinessProfile });
        const result = demo ? { ok: true as const, recommendation: demo.recommendation } : await recommendPgAction({ ...(customIndustryName === undefined ? { industryGroupId } : { customIndustryName }), contractType: draftApi.getState().contractType, currentPgs: draftApi.getState().contractType === 'renewal' ? draftApi.getState().currentPgs : [] });
        if (canceled) return;
        setState({ business: business.hasBusinessProfile, ...(result.ok ? { result: result.recommendation } : { error: result.error }) });
      } catch { if (!canceled) setState(s => ({ ...s, error: 'NETWORK_ERROR' })); }
    }
    void check();
    return () => { canceled = true; timers.forEach(clearTimeout); };
  }, [industryGroupId, customIndustryName, demo, draftApi]);

  const back = onBack && <Button variant="text" className="mt-6" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />입력 내용 다시 확인해요</Button>;
  if (state.error) return (
    <section className="mx-auto max-w-[480px] py-10" aria-label="맞춤 PG 추천">
      <div role="alert" className="space-y-4">
        <h2 className="text-[length:var(--md-typescale-headline-medium-size)] font-semibold">추천 정보를 다시 확인해주세요</h2>
        <p className="text-[var(--md-sys-color-on-surface-variant)]">{MATCHING_ERRORS[state.error] ?? '추천 정보를 불러오지 못했어요.'}</p>
        <div className="flex flex-wrap items-center gap-4"><Button variant="outlined" onClick={onRetry}>다시 확인해요</Button><a href={`mailto:${siteConfig.operator.email}`} className="text-[14px] text-[var(--md-sys-color-primary)] underline underline-offset-4">운영팀에 문의해요</a></div>
      </div>
      {back}
    </section>
  );
  if (!state.result || elapsed < MIN_MATCHING_LOADING_MS) {
    const phase = state.business === undefined || elapsed < 1000 ? 0 : !state.result || elapsed < 2000 ? 1 : elapsed < 4700 ? 2 : 3;
    return <RfpMatchingLoading phase={phase} business={state.business} industryName={industryName}>{back}</RfpMatchingLoading>;
  }
  const recommendation = state.result;
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
      <section ref={el => { paneRefs.current.pg = el; }} tabIndex={-1} hidden={pane === 'review'} aria-label="맞춤 PG 추천" className="outline-none">
        <MatchingCandidates recommendation={recommendation} selected={selected} onSelect={id => {
          const pg = recommendation.candidates.find(c => c.pgWorkspaceId === id);
          if (pg) draftApi.getState().setField('allowedPgWorkspaceIds', [{ id, displayName: pg.name, logoUpdatedAt: null }]);
        }} />
      </section>
      <div ref={el => { paneRefs.current.review = el; }} tabIndex={-1} hidden={pane === 'pg'} className="outline-none">{children}</div>
    </div>
  );
}
