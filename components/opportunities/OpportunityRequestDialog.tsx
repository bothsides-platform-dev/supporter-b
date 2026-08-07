'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { createPgRequestAction } from '@/lib/server/actions/rfp';
import { toast } from '@/lib/toast';

const ERROR_MESSAGE: Record<string, string> = {
  ALREADY_REQUESTED: '이미 요청한 견적 요청이에요.',
  ALREADY_PARTICIPATING: '이미 참여 중인 견적 요청이에요.',
  RFP_NOT_OPEN: '지금은 요청할 수 없는 견적 요청이에요.',
  RFP_DEADLINE_PASSED: '마감된 견적 요청이에요.',
  NOT_FOUND: '더 이상 열려 있지 않은 견적 요청이에요.',
  FORBIDDEN_PG: '권한이 없어요.',
  INVALID_INPUT: '메시지를 확인해 주세요.',
};

/**
 * 오픈 게시판 행의 "참여 요청" — 클릭 시 인라인으로 콜드 피치 입력창을 펼치고,
 * createPgRequestAction 으로 전송한다. 성공 시 router.refresh()로 목록을 갱신해
 * 요청한 RFP가 게시판에서 사라지게 한다.
 */
export function OpportunityRequestDialog({ rfpCode }: { rfpCode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = message.trim();
    if (!trimmed) {
      toast('메시지를 입력해 주세요.', { type: 'error' });
      return;
    }
    startTransition(async () => {
      const res = await createPgRequestAction({ rfpId: rfpCode, message: trimmed });
      if (res.ok) {
        toast('참여 요청을 보냈어요.');
        setOpen(false);
        setMessage('');
        router.refresh();
      } else {
        toast(ERROR_MESSAGE[res.error] ?? '요청을 보내지 못했어요.', { type: 'error' });
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outlined" size="sm" onClick={() => setOpen(true)}>
        참여 요청
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="구매사에게 보낼 메시지를 적어 주세요."
        aria-label="참여 요청 메시지"
        className="w-full resize-none rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-2.5 py-2 text-[14px] text-[var(--md-sys-color-on-surface)] outline-none focus:border-[var(--md-sys-color-primary)]"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? '처리 중…' : '보내기'}
        </Button>
        <Button
          variant="text"
          size="sm"
          onClick={() => {
            setOpen(false);
            setMessage('');
          }}
          disabled={pending}
        >
          취소
        </Button>
      </div>
    </div>
  );
}
