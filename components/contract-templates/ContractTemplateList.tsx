'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { LocalDate } from '@/components/primitives/LocalTime';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FileStackIcon } from '@/components/icons';
import { ContractTemplateUploadDrawer } from './ContractTemplateUploadDrawer';
import { deleteContractTemplateAction } from '@/lib/server/actions/contract-template';
import { MAX_CONTRACT_TEMPLATES } from '@/lib/types/contract-doc';
import type { ContractTemplate } from '@/lib/types/contract-doc';
import { formatSize } from '@/lib/utils/format';

export type ContractTemplateListProps = {
  initialTemplates: ContractTemplate[];
};

/** /contract-templates 목록(PG 전용) — QuoteTemplateList 전례 미러. */
export function ContractTemplateList({ initialTemplates }: ContractTemplateListProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContractTemplate | null>(null);

  const handleDelete = () => {
    if (!deleteTarget) return;
    const templateId = deleteTarget.id;
    startTransition(async () => {
      const r = await deleteContractTemplateAction({ templateId });
      setDeleteTarget(null);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <ContractTemplateUploadDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          setDrawerOpen(false);
          router.refresh();
        }}
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

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
            계약 템플릿
          </h1>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            자주 쓰는 계약서 PDF 를 등록해 두고, 전자계약 발송 시 바로 골라 써요.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outlined"
          onClick={() => setDrawerOpen(true)}
          disabled={initialTemplates.length >= MAX_CONTRACT_TEMPLATES}
        >
          새 템플릿
        </Button>
      </header>

      {initialTemplates.length === 0 ? (
        <EmptyState
          icon={<FileStackIcon size={40} />}
          title="아직 등록된 계약 템플릿이 없어요"
          description="계약서 PDF 를 올려서 전자계약 발송에 사용해 보세요."
        />
      ) : (
        <ul className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
          {initialTemplates.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">
                  {t.name}
                </p>
                <p className="truncate text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                  {t.attachment ? `${t.attachment.name} · ${formatSize(t.attachment.size)}` : '파일 없음'}
                  {' · '}
                  <LocalDate iso={t.createdAt} />
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {t.attachment && (
                  <a
                    href={`/api/files/${t.attachment.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 items-center px-2.5 text-[length:var(--md-typescale-label-medium-size)] text-[var(--md-sys-color-primary)] hover:underline"
                  >
                    본문 보기
                  </a>
                )}
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
            </li>
          ))}
        </ul>
      )}

      <p className="md-numeric text-[11px] text-[var(--md-sys-color-outline)]">
        {initialTemplates.length} / {MAX_CONTRACT_TEMPLATES}개
      </p>
    </div>
  );
}
