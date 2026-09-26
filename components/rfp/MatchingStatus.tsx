'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MatchingCandidates } from './RfpMatchingSelection';
import { requestNextPgAction, reviewPgRequestAction } from '@/lib/server/actions/rfp/matching';
import { MATCHING_ERRORS, type BuyerMatching, type PgReview } from '@/lib/rfp/pg-matching';
import { endOfDayKstIso, kstDateOf } from '@/lib/utils/deadline';
import { isRfpBidWindowOpen } from '@/lib/rfp/bid-window';
import type { RFP } from '@/lib/types/rfp';

const LABELS: Record<PgReview['status'], { label: string; color: ChipColor }> = {
  requested: { label: '상담 요청 완료', color: 'primary' },
  reviewing: { label: 'PG 검토 중', color: 'warning' },
  quoted: { label: '견적 도착', color: 'tertiary' },
  rejected: { label: '상담 거절', color: 'error' },
  withdrawn: { label: '견적 철회', color: 'surface' },
};
const field = 'block w-full rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-transparent p-2 text-[14px]';

export function BuyerMatchingStatus({ rfpId, rfpCode, deadline: responseDeadline, status, data }: {
  rfpId: string;
  rfpCode: string;
  deadline: string;
  status: RFP['status'];
  data: BuyerMatching;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState('');
  const [minDate] = useState(() => kstDateOf(new Date(Date.now() + 86400000)));
  const [deadline, setDeadline] = useState(() => kstDateOf(new Date(Date.now() + 7 * 86400000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== 'sent') return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const currentTime = Date.now();
      setNow(currentTime);
      const remaining = new Date(responseDeadline).getTime() - currentTime;
      if (remaining > 0) timer = setTimeout(tick, Math.min(remaining, 2_147_483_647));
    };
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [responseDeadline, status]);
  const current = data.reviews.at(-1);
  if (!current) return null;
  const terminal = current.status === 'rejected' || current.status === 'withdrawn';
  const next = terminal && status === 'sent';
  const ended = status !== 'sent';
  const unanswered = !terminal && current.status !== 'quoted';
  const overdue = !ended && unanswered && !isRfpBidWindowOpen({ status, deadline: responseDeadline }, now);
  const supportSubject = `[서포트비] 다른 PG 상담 문의 · ${rfpCode}`;
  const supportBody = `견적 요청 번호: ${rfpCode}\n현재 상담 PG사: ${current.candidate.name}\n상담 상태: ${LABELS[current.status].label}\n\n다른 PG사와 상담할 수 있는지 문의해요.\n문의 사유: ${overdue ? '견적 마감일까지 답변을 받지 못했어요.' : current.status === 'quoted' ? '받은 견적 조건이 맞지 않아요.' : '상담 답변이 늦어지고 있어요.'}`;
  const supportHref = `mailto:help@support-b.com?subject=${encodeURIComponent(supportSubject)}&body=${encodeURIComponent(supportBody)}`;
  const heading = status === 'awarded' ? 'PG사 선정을 마쳤어요'
    : status === 'closed' ? '상담이 마감됐어요'
    : status === 'cancelled' ? '상담이 취소됐어요'
    : next ? '다른 PG사와 상담을 이어가세요'
    : overdue ? '견적 마감일까지 답변이 도착하지 않았어요'
    : current.status === 'quoted' ? '도착한 견적을 확인해주세요'
    : `${current.candidate.name}에 상담을 요청했어요`;
  return <section className="mb-6 space-y-5 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] p-5" aria-label="상담 진행">
    <div className="space-y-2">
      <Chip {...LABELS[current.status]} />
      <h2 className="text-[20px] font-semibold" aria-live="polite">{heading}</h2>
      {!ended && unanswered && !overdue && <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">PG사 담당자가 영업일 기준 <span className="md-numeric">1~5일</span> 이내에 연락드릴 예정이에요. 검토가 끝나면 견적 또는 검토 결과를 알려드려요.</p>}
      {overdue && <p className="text-[14px]">견적 접수 기간이 끝났어요. 운영팀에 현재 상담 확인과 다음 PG사 상담을 문의해주세요.</p>}
      {!ended && current.status === 'quoted' && <p className="text-[14px]">수수료와 계약 조건을 확인한 뒤 최종 선정해주세요. 선정하면 PG사가 계약서를 준비해요.</p>}
    </div>
    {!ended && !terminal && <div className="space-y-2 text-[14px]">
      <p>답변이 늦거나 견적 조건이 맞지 않으면 운영팀에 다른 PG사 상담을 문의할 수 있어요.</p>
      <a href={supportHref} className="inline-block text-[var(--md-sys-color-primary)] underline underline-offset-4">다른 PG 상담을 문의해요</a>
      <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">이메일 앱에서 문의 내용을 확인하고 보내주세요. 문의만으로 현재 상담이 종료되지는 않아요. 이메일 앱을 사용하지 않으면 help@support-b.com으로 견적 요청 번호 <span className="md-numeric">{rfpCode}</span>와 문의 내용을 보내주세요.</p>
    </div>}
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

export function PgReviewPanel({ rfpId, status, review, onReviewStarted }: { rfpId: string; status: RFP['status']; review: Pick<PgReview, 'id' | 'status' | 'reason'>; onReviewStarted?: () => void }) {
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
      else {
        setRejectOpen(false);
        if (target === 'reviewing') onReviewStarted?.();
        router.refresh();
      }
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
