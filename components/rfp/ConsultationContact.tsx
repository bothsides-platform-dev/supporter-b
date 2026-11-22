'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AssignmentSummary } from '@/lib/rfp/assignment';
import { Button } from '@/components/primitives/Button';
import { answerContactAction, reportContactAction } from '@/lib/server/actions/rfp/consultation';

export function ConsultationContact({
  reviewId,
  summary,
}: {
  reviewId: string;
  summary: AssignmentSummary;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState('');
  function save(received?: boolean) {
    start(async () => {
      try {
        const result =
          received === undefined
            ? await reportContactAction(reviewId, summary.reportAfter ?? null)
            : await answerContactAction(summary.questionId!, received);
        setStatus(result.ok ? '기록했어요.' : '상담 상태가 바뀌었어요. 최신 내용을 확인해주세요.');
        router.refresh();
      } catch {
        setStatus('저장하지 못했어요. 다시 시도해주세요.');
      }
    });
  }
  return (
    <div className="space-y-2 text-[14px]">
      <p>
        {summary.assigned ? '담당자가 배정됐어요.' : '담당자를 배정하고 있어요.'} 첫 연락 기한은{' '}
        <strong>
          {new Date(summary.due).toLocaleString('ko-KR', {
            timeZone: 'Asia/Seoul',
            dateStyle: 'long',
            timeStyle: 'short',
          })}
        </strong>
        예요.
      </p>
      {summary.canReport && (
        <Button variant="outlined" disabled={pending} onClick={() => save()}>
          연락했어요
        </Button>
      )}
      {summary.questionId && (
        <fieldset disabled={pending} className="flex flex-wrap gap-2">
          <legend className="mb-2 font-medium">연락 받으셨나요?</legend>
          <Button onClick={() => save(true)}>받았어요</Button>
          <Button variant="outlined" onClick={() => save(false)}>
            못 받았어요
          </Button>
        </fieldset>
      )}
      {status && <p role="status">{status}</p>}
    </div>
  );
}
