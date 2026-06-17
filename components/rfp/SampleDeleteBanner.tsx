'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';

type DeleteResult = { ok: true } | { ok: false; error: string };

// buyer/PG 공용 샘플 삭제 배너(프레젠테이션). 삭제 액션의 buyer/PG ACL 차이는
// 호출처가 onDelete 로 주입한다 — 액션 자체는 합치지 않는다.
export function SampleDeleteBanner({
  rfpCode,
  blurb,
  onDeleteAction,
  redirectTo,
}: {
  rfpCode: string;
  blurb: string;
  onDeleteAction: (code: string) => Promise<DeleteResult>;
  redirectTo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    const r = await onDeleteAction(rfpCode);
    if (!r.ok) {
      setBusy(false);
      toast(`삭제하지 못했어요 — ${r.error}`, { type: 'error' });
      return;
    }
    setOpen(false);
    toast('샘플 견적 요청을 삭제했어요.');
    startTransition(() => router.push(redirectTo));
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-3">
      <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">{blurb}</p>
      <Button variant="outlined" size="sm" color="error" onClick={() => setOpen(true)}>
        샘플 삭제
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title="샘플 견적 요청을 삭제할까요?"
        description="삭제하면 다시 표시되지 않아요."
        confirmLabel="삭제"
        variant="danger"
        onConfirm={handleDelete}
        loading={busy}
      />
    </div>
  );
}
