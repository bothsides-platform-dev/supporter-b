'use client';
import { useBuyerDemo } from '@/lib/demo/buyer-demo-context';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/primitives/Button';
import { requestRequoteAction } from '@/lib/server/actions/rfp';
import { cn } from '@/lib/utils';
import { BusinessDeadlineField } from '@/components/rfp/BusinessDeadlineField';
import { deadlineErrorMessage } from '@/lib/rfp/deadline-errors';
import type { DeadlineChoice } from '@/lib/rfp/deadline-choice';
import { demoRequoteDeadline } from '@/lib/demo/demo-examples';

type Candidate = { pgWsId: string; name: string };

export function RequoteDialog({
  open,
  onOpenChange,
  rfpId,
  candidates,
  defaultPgWsId,
  afterDeadline,
  onRequested,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** uuid — requestRequoteAction 용 */
  rfpId: string;
  /** 현재 견적을 낸 PG들(재요청 대상 후보). */
  candidates: Candidate[];
  defaultPgWsId?: string;
  /** 견적 요청의 공용 마감 — 서버가 이보다 늦은 응답 마감만 받는다(DEADLINE_MUST_EXTEND). */
  afterDeadline: string | undefined;
  onRequested?: () => void;
}) {
  const demo = useBuyerDemo();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultPgWsId ? [defaultPgWsId] : []));
  const [message, setMessage] = useState('');
  const [deadline, setDeadline] = useState('');
  const [choice, setChoice] = useState<DeadlineChoice>({ mode: 'period', days: 5 });
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [deadlineValid, setDeadlineValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const messageInvalid = message.trim().length === 0;

  const handleSubmit = async () => {
    if (submitting) return;
    if (selected.size === 0) { setError('수정 요청할 PG사를 한 곳 이상 선택해 주세요'); return; }
    if (messageInvalid) { setError('수정 요청 내용을 입력해 주세요'); return; }
    if (!deadline || !deadlineValid) { setError('응답 마감일을 확인해 주세요'); return; }
    setSubmitting(true);
    setError('');
    try {
      const r = await (demo?.requote ?? requestRequoteAction)({
        rfpId,
        pgWsIds: [...selected],
        message: message.trim(),
        newDeadline: deadline,
      });
      if (!r.ok) { setError(deadlineErrorMessage(r.error)); setDeadlineValid(false); setCalendarRefreshKey(key => key + 1); return; }
      onRequested?.();
      onOpenChange(false);
    } catch {
      setError('수정 요청 결과를 확인하지 못했어요. 새로고침해서 현재 상태를 확인해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>견적 수정을 요청할까요?</DialogTitle>
          <DialogDescription>
            선택한 PG사에 수정 내용과 응답 마감일을 보내요. 다른 PG사의 마감일은 바뀌지 않아요.
          </DialogDescription>
        </DialogHeader>
        {demo && <div data-demo-guide-slot />}

        <fieldset className="space-y-2">
          <legend className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
            수정 요청할 PG사
          </legend>
          <div className="space-y-1.5">
            {candidates.map((c) => (
              <label key={c.pgWsId} data-coachmark={demo && selected.size === 0 ? 'demo-requote-pg' : undefined} className={cn('flex items-center gap-2 text-[13px] cursor-pointer', demo && 'min-h-11')}>
                <input
                  type="checkbox"
                  aria-label={c.name}
                  checked={selected.has(c.pgWsId)}
                  onChange={() => toggle(c.pgWsId)}
                />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>

        {demo && !message.trim() && <Button
          className="min-h-11"
          variant="outlined"
          size="sm"
          data-coachmark="demo-requote-example"
          disabled={submitting}
          onClick={() => {
            if (message.trim() || submitting) return;
            setMessage('정산주기를 D+3으로 조정해주세요');
            if (!deadlineValid) {
              setDeadline(`${demoRequoteDeadline(afterDeadline ?? new Date().toISOString())}T09:00:00.000Z`);
              setChoice({ mode: 'date' });
            }
          }}
        >예시 수정 요청 넣기</Button>}

        <div className="space-y-1">
          <span className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
            수정 요청 내용 *
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="수정할 내용을 입력해 주세요 (예: 카드 수수료를 0.1%p 낮춰주세요)"
            rows={3}
            className={cn("w-full rounded-[6px] border border-[var(--md-sys-color-outline)] bg-transparent p-2 text-[13px] focus:outline-none focus:border-[var(--md-sys-color-on-surface)]", demo && 'text-base')}
          />
        </div>

        <BusinessDeadlineField label="응답 마감일" value={deadline} choice={choice} onChange={(value, nextChoice) => { setDeadline(value); setChoice(nextChoice); }} onValidityChange={setDeadlineValid} afterDeadline={afterDeadline} refreshKey={calendarRefreshKey} />

        {error && (
          <p role="alert" className={cn('md-label-small text-[var(--md-sys-color-error)]')}>
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outlined" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            닫기
          </Button>
          <Button className={demo ? 'min-h-11 sm:min-h-7' : undefined} data-coachmark="demo-requote-send" size="sm" onClick={handleSubmit} disabled={submitting || !deadlineValid || (!!demo && (selected.size === 0 || messageInvalid))}>
            {submitting ? '처리 중…' : '수정 요청 보내기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
