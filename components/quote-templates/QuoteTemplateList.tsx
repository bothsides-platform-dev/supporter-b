'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Chip } from '@/components/primitives/Chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { QuoteTemplateDrawer } from '@/components/quote-templates/QuoteTemplateDrawer';
import { deleteQuoteTemplateAction } from '@/lib/server/actions/quote-template/deleteQuoteTemplateAction';
import { duplicateQuoteTemplateAction } from '@/lib/server/actions/quote-template/duplicateQuoteTemplateAction';
import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type TierRates,
} from '@/lib/types/bid';
import type { QuoteTemplateOption } from '@/lib/types/bid';

const MAX_CHIPS = 4;
const MAX_TEMPLATES = 20;

function fmtPct(rate: number): string {
  return String(Math.round(rate * 1e6) / 1e4);
}

function buildChips(paymentFees: Partial<Record<PaymentMethod, number | TierRates>>): string[] {
  const chips: string[] = [];
  for (const [method, value] of Object.entries(paymentFees) as [PaymentMethod, number | TierRates][]) {
    const label = PAYMENT_METHOD_LABELS[method] ?? method;
    if (typeof value === 'object') {
      chips.push(`${label} 구간별`);
    } else {
      chips.push(`${label} ${fmtPct(value)}%`);
    }
  }
  return chips;
}

export function QuoteTemplateList({
  initialTemplates,
  workspaceName,
}: {
  initialTemplates: QuoteTemplateOption[];
  workspaceName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<QuoteTemplateOption | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuoteTemplateOption | null>(null);

  const openNew = () => {
    setEditTarget(null);
    setDrawerOpen(true);
  };

  const openEdit = (t: QuoteTemplateOption) => {
    setEditTarget(t);
    setDrawerOpen(true);
  };

  const handleDuplicate = (t: QuoteTemplateOption) => {
    startTransition(async () => {
      const r = await duplicateQuoteTemplateAction({ templateId: t.id });
      if (r.ok) router.refresh();
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const templateId = deleteTarget.id;
    startTransition(async () => {
      const r = await deleteQuoteTemplateAction({ templateId });
      setDeleteTarget(null);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <QuoteTemplateDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        template={editTarget}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="템플릿을 삭제할까요?"
        description={`"${deleteTarget?.name ?? ''}" 템플릿이 영구히 삭제돼요.`}
        confirmLabel="삭제할게요"
        variant="danger"
        onConfirm={handleDelete}
        loading={pending}
      />

      <div className="flex items-center justify-between">
        <span className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] md-numeric">
          {initialTemplates.length} / {MAX_TEMPLATES}개
        </span>
        <Button
          type="button"
          size="sm"
          variant="outlined"
          onClick={openNew}
        >
          새 템플릿
        </Button>
      </div>

      {initialTemplates.length === 0 ? (
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          아직 저장된 템플릿이 없어요. 새 템플릿을 만들어 보세요.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
          {initialTemplates.map((t) => {
            const allChips = buildChips(t.paymentFees);
            const visibleChips = allChips.slice(0, MAX_CHIPS);
            const overflow = allChips.length - MAX_CHIPS;

            return (
              <li key={t.id} className="py-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[14px] font-medium text-[var(--md-sys-color-on-surface)] truncate">
                      {t.name}
                    </p>
                    <p className="font-mono text-[11px] text-[var(--md-sys-color-outline)] md-numeric">
                      정산 {t.settleCycle} · 한도 {t.settleLimit.toLocaleString()}원
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="text"
                      onClick={() => openEdit(t)}
                    >
                      편집
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="text"
                      onClick={() => handleDuplicate(t)}
                      disabled={pending}
                    >
                      복제
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="text"
                      color="error"
                      onClick={() => setDeleteTarget(t)}
                    >
                      삭제
                    </Button>
                  </div>
                </div>
                {visibleChips.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {visibleChips.map((chip) => (
                      <Chip key={chip} label={chip} color="surface" />
                    ))}
                    {overflow > 0 && (
                      <Chip label={`+${overflow}`} color="surface" />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
