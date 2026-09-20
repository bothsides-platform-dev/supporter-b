'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { Chip } from '@/components/primitives/Chip';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { matchingBusinessAction, recommendPgAction } from '@/lib/server/actions/rfp/matching';
import { MATCHING_ERRORS, type Recommendation } from '@/lib/rfp/pg-matching';

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
            <label key={pg.pgWorkspaceId} className="flex cursor-pointer items-start gap-3 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] p-4 hover:bg-[var(--md-sys-color-surface-container-low)] has-[:checked]:border-[var(--md-sys-color-primary)]">
              <input type="radio" name="matching-pg" value={pg.pgWorkspaceId} checked={selected === pg.pgWorkspaceId} onChange={() => onSelect(pg.pgWorkspaceId)} className="mt-1 accent-[var(--md-sys-color-primary)]" />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-center gap-2 font-semibold">{pg.name}{index === 0 && <Chip label="우선 추천" color="primary" />}</span>
                <span className="block text-[14px] text-[var(--md-sys-color-on-surface-variant)]">{pg.reason}</span>
                <span className="block pt-2 text-[14px]">{pg.feeMin === null ? '견적에서 안내해요' : <>영세 기준 예상 수수료 <span className="md-numeric font-semibold">{pg.feeMin}% ~ {pg.feeMax}%</span></>}</span>
                {pg.feeNote && <span className="block text-[13px] text-[var(--md-sys-color-on-surface-variant)]">{pg.feeNote}</span>}
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-[13px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">영세 기준은 연 매출 <span className="md-numeric">3억 원</span> 이하예요. 표시한 요율은 예상 조건이며 실제 수수료는 PG사 견적에서 확인해주세요. 신규 사업자는 반기별 영세·중소가맹점 선정 결과에 따라 우대수수료가 적용되고, 대상 가맹점은 기존 납부 수수료와의 차액을 환급받을 수 있어요.</p>
      </> : <a href="mailto:help@support-b.com" className="inline-block text-[14px] text-[var(--md-sys-color-primary)] underline underline-offset-4">운영팀에 문의해요</a>}
    </div>
  );
}

export function RfpMatchingSelection() {
  const industryGroupId = useRfpDraftStore(s => s.industryGroupId);
  const selected = useRfpDraftStore(s => s.allowedPgWorkspaceIds[0]?.id ?? '');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ progress: number; business?: boolean; result?: Recommendation; error?: string }>({ progress: 0 });
  useEffect(() => {
    let canceled = false;
    useRfpDraftStore.getState().setField('allowedPgWorkspaceIds', []);
    async function check() {
      setState({ progress: 0 });
      try {
        const business = await matchingBusinessAction();
        if (canceled) return;
        if (!business.ok) { setState({ progress: 0, error: business.error }); return; }
        setState({ progress: 50, business: business.hasBusinessProfile });
        const result = await recommendPgAction(industryGroupId);
        if (canceled) return;
        setState({ progress: result.ok ? 100 : 50, business: business.hasBusinessProfile, ...(result.ok ? { result: result.recommendation } : { error: result.error }) });
      } catch { if (!canceled) setState(s => ({ ...s, error: 'NETWORK_ERROR' })); }
    }
    void check();
    return () => { canceled = true; };
  }, [industryGroupId, attempt]);
  return (
    <section className="space-y-5" aria-label="맞춤 PG 추천">
      <div className="space-y-3" aria-live="polite">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[16px] font-semibold">{state.progress === 100 ? '맞춤 PG 추천을 마쳤어요' : '입력한 사업자 정보를 바탕으로 PG사를 추천해요'}</h2>
          <span className="md-numeric text-[14px]">{state.progress}%</span>
        </div>
        <div role="progressbar" aria-label="추천 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.progress} className="h-1 overflow-hidden rounded-[6px] bg-[var(--md-sys-color-surface-container-high)]">
          <div className="h-full origin-left bg-[var(--md-sys-color-primary)] transition-transform motion-reduce:transition-none" style={{ transform: `scaleX(${state.progress / 100})` }} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          <span>사업자 정보 · {state.business === undefined ? '확인 중' : state.business ? '등록 정보 확인' : '등록된 정보 없음'}</span>
          <span>업종 정보 · {state.result ? state.result.industryName : '확인 중'}</span>
        </div>
      </div>
      {state.error && <div role="alert" className="space-y-3"><p className="text-[14px]">{MATCHING_ERRORS[state.error] ?? '추천 정보를 불러오지 못했어요.'}</p><div className="flex flex-wrap items-center gap-4"><Button variant="outlined" onClick={() => setAttempt(a => a + 1)}>다시 확인해요</Button><a href="mailto:help@support-b.com" className="text-[14px] text-[var(--md-sys-color-primary)] underline underline-offset-4">운영팀에 문의해요</a></div></div>}
      {state.result && <MatchingCandidates recommendation={state.result} selected={selected} onSelect={id => {
        const pg = state.result?.candidates.find(c => c.pgWorkspaceId === id);
        if (pg) useRfpDraftStore.getState().setField('allowedPgWorkspaceIds', [{ id, displayName: pg.name, logoUpdatedAt: null }]);
      }} />}
    </section>
  );
}
