'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteSamplePgRfpAction } from '@/lib/server/actions/onboarding/deleteSamplePgRfpAction';
import { toast } from '@/lib/toast';

// 인박스 상세 상단 — PG 온보딩 샘플 견적 요청 안내 + 삭제. rfp.isSample 일 때만 렌더.
export function SamplePgRfpBanner({ rfpCode }: { rfpCode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    const r = await deleteSamplePgRfpAction({ code: rfpCode });
    if (!r.ok) {
      setBusy(false);
      toast(`삭제하지 못했어요 — ${r.error}`, { type: 'error' });
      return;
    }
    setOpen(false);
    toast('샘플 견적 요청을 삭제했어요.');
    startTransition(() => router.push('/inbox'));
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-3">
      <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        둘러보기용 샘플 견적 요청이에요. 직접 견적을 작성해 보내보면 선정되는 과정을 체험할 수 있어요. 다 살펴봤다면 삭제해도 돼요.
      </p>
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
