'use client';

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
import { endOfDayKstIso, kstDateOf } from '@/lib/utils/deadline';

type Candidate = { pgWsId: string; name: string };

export function RequoteDialog({
  open,
  onOpenChange,
  rfpId,
  candidates,
  onRequested,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** uuid — requestRequoteAction 용 */
  rfpId: string;
  /** 현재 견적을 낸 PG들(재요청 대상 후보). */
  candidates: Candidate[];
  onRequested?: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  // Lazy init: computing the min date is impure (Date.now), so it must not run in
  // the render body (react-hooks/purity). It only needs to be evaluated once.
  // KST "내일" 날짜: 이른 KST 새벽에 당일이 선택 가능한 엣지를 막는다.
  const [tomorrow] = useState(() => kstDateOf(new Date(Date.now() + 86_400_000)));
  const [deadline, setDeadline] = useState('');
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
    if (selected.size === 0) { setError('재요청할 PG를 한 곳 이상 선택해 주세요'); return; }
    if (messageInvalid) { setError('개선 요청 메시지를 입력해 주세요'); return; }
    if (!deadline) { setError('새 마감일을 선택해 주세요'); return; }
    setSubmitting(true);
    setError('');
    const r = await requestRequoteAction({
      rfpId,
      pgWsIds: [...selected],
      message: message.trim(),
      newDeadline: endOfDayKstIso(deadline),
    });
    setSubmitting(false);
    if (!r.ok) { setError(r.error); return; }
    onRequested?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent showCloseButton={false} className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>견적을 다시 요청할까요?</DialogTitle>
          <DialogDescription>
            선택한 PG에게 새 마감일과 메시지를 보내요. 받은 PG는 조건을 고쳐 다시 보낼 수 있어요.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
            재요청할 PG
          </legend>
          <div className="space-y-1.5">
            {candidates.map((c) => (
              <label key={c.pgWsId} className="flex items-center gap-2 text-[13px] cursor-pointer">
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

        <div className="space-y-1">
          <span className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">
            메시지 *
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="개선 요청 내용을 입력해 주세요 (예: 카드 수수료를 0.1%p만 더 낮춰주세요)"
            rows={3}
            className="w-full rounded-[6px] border border-[var(--md-sys-color-outline)] bg-transparent p-2 text-[13px] focus:outline-none focus:border-[var(--md-sys-color-on-surface)]"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="requote-deadline"
            className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]"
          >
            새 마감일 *
          </label>
          <input
            id="requote-deadline"
            type="date"
            aria-label="새 마감일"
            value={deadline}
            min={tomorrow}
            onChange={(e) => setDeadline(e.target.value)}
            className="block bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] md-numeric focus:outline-none focus:border-[var(--md-sys-color-on-surface)]"
          />
        </div>

        {error && (
          <p role="alert" className={cn('md-label-small text-[var(--md-sys-color-error)]')}>
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outlined" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '처리 중…' : '재요청 보내기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
