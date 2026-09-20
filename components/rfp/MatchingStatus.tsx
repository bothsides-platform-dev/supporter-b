'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MatchingCandidates } from './RfpMatchingSelection';
import { requestNextPgAction, reviewPgRequestAction } from '@/lib/server/actions/rfp/matching';
import { MATCHING_ERRORS, type BuyerMatching, type PgReview } from '@/lib/rfp/pg-matching';
import { endOfDayKstIso, kstDateOf } from '@/lib/utils/deadline';
import type { RFP } from '@/lib/types/rfp';

const LABELS: Record<PgReview['status'], { label: string; color: ChipColor }> = {
  requested: { label: '상담 요청 완료', color: 'primary' },
  reviewing: { label: 'PG 검토 중', color: 'warning' },
  quoted: { label: '견적 도착', color: 'tertiary' },
  rejected: { label: '상담 거절', color: 'error' },
  withdrawn: { label: '견적 철회', color: 'surface' },
};
const field = 'block w-full rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-transparent p-2 text-[14px]';

export function BuyerMatchingStatus({ rfpId, status, data }: { rfpId: string; status: RFP['status']; data: BuyerMatching }) {
  const router = useRouter();
  const [selected, setSelected] = useState('');
  const [minDate] = useState(() => kstDateOf(new Date(Date.now() + 86400000)));
  const [deadline, setDeadline] = useState(() => kstDateOf(new Date(Date.now() + 7 * 86400000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = data.reviews.at(-1);
  if (!current) return null;
  const terminal = current.status === 'rejected' || current.status === 'withdrawn';
  const next = terminal && status === 'sent';
  const ended = status === 'closed' || status === 'cancelled';
  return <section className="mb-6 space-y-5 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] p-5" aria-label="상담 진행">
    <div className="space-y-2">
      <Chip {...LABELS[current.status]} />
      <h2 className="text-[20px] font-semibold">{ended ? status === 'closed' ? '상담이 마감됐어요' : '상담이 취소됐어요' : next ? '다른 PG사와 상담을 이어가세요' : current.status === 'quoted' ? '도착한 견적을 확인해주세요' : `${current.candidate.name}에 상담을 요청했어요`}</h2>
      {!ended && !terminal && current.status !== 'quoted' && <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">PG사 담당자가 영업일 기준 <span className="md-numeric">1~5일</span> 이내에 연락드릴 예정이에요. 검토가 끝나면 견적 또는 검토 결과를 알려드려요.</p>}
      {!ended && !terminal && current.status !== 'quoted' && <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">연락이 지연되면 <a href="mailto:help@support-b.com" className="text-[var(--md-sys-color-primary)] underline underline-offset-4">운영팀에 문의해요</a>.</p>}
      {!ended && current.status === 'quoted' && <p className="text-[14px]">수수료와 계약 조건을 확인한 뒤 최종 선정해주세요. 선정하면 PG사가 계약서를 준비해요.</p>}
    </div>
    <ol className="divide-y divide-[var(--md-sys-color-outline-variant)]">
      {data.reviews.map(review => <li key={review.id} className="space-y-2 py-3 text-[14px]">
        <div className="flex flex-wrap items-center justify-between gap-2"><span>{review.candidate.name}</span><Chip {...LABELS[review.status]} /></div>
        {review.reason && <p className="whitespace-pre-wrap break-words text-[var(--md-sys-color-on-surface-variant)]">{review.reason}</p>}
      </li>)}
    </ol>
    {next && <>
      <MatchingCandidates recommendation={data.recommendation} selected={selected} onSelect={setSelected} />
      {data.recommendation.candidates.length > 0 && <div className="space-y-3">
        <label className="block space-y-1 text-[14px]">새 견적 마감일<input aria-label="새 견적 마감일" type="date" min={minDate} value={deadline} onChange={e => setDeadline(e.target.value)} className={`${field} md-numeric`} /></label>
        {error && <p role="alert" className="text-[14px] text-[var(--md-sys-color-error)]">{error}</p>}
        <Button disabled={busy || !selected || !deadline} onClick={async () => {
          setBusy(true); setError('');
          try {
            const result = await requestNextPgAction({ rfpId, previousReviewId: current.id, pgWorkspaceId: selected, deadline: endOfDayKstIso(deadline) });
            if (!result.ok) setError(MATCHING_ERRORS[result.error] ?? '요청하지 못했어요. 다시 확인해주세요.');
            else { setSelected(''); router.refresh(); }
          } catch { setError(MATCHING_ERRORS.NETWORK_ERROR); }
          finally { setBusy(false); }
        }}>{busy ? '요청하는 중…' : '다음 PG사에 상담 요청하기'}</Button>
      </div>}
    </>}
  </section>;
}

export function PgReviewPanel({ rfpId, status, review }: { rfpId: string; status: RFP['status']; review: Pick<PgReview, 'id' | 'status' | 'reason'> }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const editable = status === 'sent' && (review.status === 'requested' || review.status === 'reviewing');
  async function submit(target: 'reviewing' | 'rejected') {
    if (target === 'rejected' && !reason.trim()) { setError('구매사에게 안내할 거절 사유를 입력해주세요.'); return; }
    setBusy(true); setError('');
    try {
      const result = await reviewPgRequestAction({ rfpId, reviewId: review.id, status: target, reason: target === 'rejected' ? reason : '' });
      if (!result.ok) setError(MATCHING_ERRORS[result.error] ?? '검토 결과를 저장하지 못했어요.');
      else { setRejectOpen(false); router.refresh(); }
    } catch { setError(MATCHING_ERRORS.NETWORK_ERROR); }
    finally { setBusy(false); }
  }
  return <section className="mb-5 space-y-3 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] p-4" aria-label="입점 검토">
    <div className="flex items-center justify-between gap-3"><h2 className="text-[16px] font-semibold">입점 검토</h2><Chip {...LABELS[review.status]} /></div>
    {review.reason && <p className="whitespace-pre-wrap text-[14px]">{review.reason}</p>}
    {editable && <>
      <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">사업자 정보와 업종의 위험 요소를 확인해주세요. 상담이 가능하면 견적 작성에서 조건을 제안해주세요.</p>
      {review.status === 'requested' && <Button variant="outlined" disabled={busy} onClick={() => submit('reviewing')}>검토 시작하기</Button>}
      <label className="block space-y-1 text-[14px]">거절 사유<textarea aria-label="거절 사유" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className={field} placeholder="구매사에게 전달할 사유를 입력해주세요" /></label>
      {error && <p role="alert" className="text-[14px] text-[var(--md-sys-color-error)]">{error}</p>}
      <Button variant="outlined" disabled={busy} onClick={() => { if (!reason.trim()) setError('구매사에게 안내할 거절 사유를 입력해주세요.'); else { setError(''); setRejectOpen(true); } }}>상담 거절하기</Button>
    </>}
    <ConfirmDialog open={rejectOpen} onOpenChange={setRejectOpen} title="상담을 거절할까요?" description="거절 사유가 구매사에 전달돼요. 이 PG사의 상담은 다시 열 수 없어요." confirmLabel="거절 확정하기" variant="danger" loading={busy} onConfirm={() => submit('rejected')} />
  </section>;
}
