'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/primitives/Button';
import { BusinessDeadlineField } from '@/components/rfp/BusinessDeadlineField';
import { changeRfpDeadlineAction } from '@/lib/server/actions/rfp/changeRfpDeadlineAction';
import { deadlineErrorMessage } from '@/lib/rfp/deadline-errors';
import type { DeadlineChoice } from '@/lib/rfp/deadline-choice';

export function DeadlineChangeDialog({ open, onOpenChange, rfpId, expectedDeadline, latestDeadline, expectedReviewId, reopen, onChanged }: { open: boolean; onOpenChange: (open: boolean) => void; rfpId: string; expectedDeadline: string; latestDeadline?: string; expectedReviewId?: string; reopen: boolean; onChanged: () => void }) {
  const [deadline, setDeadline] = useState('');
  const [choice, setChoice] = useState<DeadlineChoice>({ mode: 'period', days: 5 });
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [deadlineValid, setDeadlineValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const label = reopen ? '견적 접수 다시 열기' : '마감일 연장하기';
  return <Dialog open={open} onOpenChange={value => !busy && onOpenChange(value)}>
    <DialogContent showCloseButton={false} className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>{reopen ? '견적 접수를 다시 열까요?' : '견적 마감일을 연장할까요?'}</DialogTitle>
        <DialogDescription>{reopen ? '기존 견적은 유지돼요. 새 마감일까지 아직 제출하지 않은 초대 PG사에서 견적을 받을 수 있어요.' : '새 마감일이 진행 중인 재요청에도 적용돼요.'}</DialogDescription>
      </DialogHeader>
      <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">현재 가장 늦은 마감일: <span className="md-numeric">{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(latestDeadline ?? expectedDeadline))}</span></p>
      <BusinessDeadlineField label="새 견적 마감일" value={deadline} choice={choice} onChange={(value, nextChoice) => { setDeadline(value); setChoice(nextChoice); }} onValidityChange={setDeadlineValid} afterDeadline={latestDeadline ?? expectedDeadline} refreshKey={calendarRefreshKey} />
      {error && <p role="alert" className="text-[13px] text-[var(--md-sys-color-error)]">{error}</p>}
      <DialogFooter>
        <Button variant="outlined" onClick={() => onOpenChange(false)} disabled={busy}>닫기</Button>
        <Button disabled={busy || !deadline || !deadlineValid} onClick={async () => {
          setBusy(true); setError('');
          try {
            const result = await changeRfpDeadlineAction({ rfpId, expectedDeadline, newDeadline: deadline, ...(expectedReviewId ? { expectedReviewId } : {}), reopen });
            if (!result.ok) { setError(deadlineErrorMessage(result.error)); setDeadlineValid(false); setCalendarRefreshKey(key => key + 1); onChanged(); return; }
            onOpenChange(false); onChanged();
          } catch { setError('요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
          finally { setBusy(false); }
        }}>{busy ? '처리 중…' : label}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
