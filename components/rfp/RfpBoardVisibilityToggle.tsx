'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { setRfpBoardVisibilityAction } from '@/lib/server/actions/rfp';
import { toast } from '@/lib/toast';

/**
 * 구매사가 RFP를 오픈 게시판에 노출할지 토글(opt-out). 기본 노출(true).
 * canEdit=false 면 읽기 전용 상태만 표시.
 */
export function RfpBoardVisibilityToggle({
  rfpCode,
  boardVisible,
  canEdit,
}: {
  rfpCode: string;
  boardVisible: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(boardVisible);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !visible;
    startTransition(async () => {
      const res = await setRfpBoardVisibilityAction({ rfpId: rfpCode, visible: next });
      if (res.ok) {
        setVisible(next);
        toast(next ? '게시판에 노출했어요.' : '게시판에서 숨겼어요.');
        router.refresh();
      } else {
        toast('변경하지 못했어요.', { type: 'error' });
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col">
        <Label size="md" muted={false}>오픈 게시판 노출</Label>
        <span className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
          {visible
            ? '다른 PG사가 이 RFP를 발견하고 참여를 요청할 수 있어요.'
            : '게시판에서 숨겨져 초대한 PG사만 볼 수 있어요.'}
        </span>
      </div>
      {canEdit && (
        <Button variant="outlined" size="sm" onClick={toggle} disabled={pending}>
          {pending ? 'LOADING…' : visible ? '숨기기' : '노출하기'}
        </Button>
      )}
    </div>
  );
}
