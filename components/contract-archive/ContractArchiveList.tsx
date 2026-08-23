'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { ArrowDownIcon, FileSignatureIcon, PlusIcon, SearchIcon } from '@/components/icons';
import { Button } from '@/components/primitives/Button';
import { Chip } from '@/components/primitives/Chip';
import { EmptyState } from '@/components/primitives/EmptyState';
import { PageHeader } from '@/components/shell/PageHeader';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ContractArchiveUploadDialog } from './ContractArchiveUploadDialog';
import { captureActionError } from '@/lib/observability/capture';
import { contractArchiveErrorMessage } from '@/lib/contract-archive/error-messages';
import { toast } from '@/lib/toast';
import { deleteContractArchiveAction } from '@/lib/server/actions/contract-archive';
import { matchesQuery } from '@/lib/contract-archive/search';
import type { ContractArchiveEntry } from '@/lib/types/contract-archive';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function StatusChip({ status }: { status: ContractArchiveEntry['status'] }) {
  if (status === 'ready') return null;
  return status === 'pending' ? (
    <Chip color="warning" label="보관 준비 중" />
  ) : (
    <Chip color="error" label="보관 실패" />
  );
}

export function ContractArchiveList({
  initialEntries,
  loadFailed = false,
}: {
  initialEntries: ContractArchiveEntry[];
  loadFailed?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContractArchiveEntry | null>(null);

  const rows = useMemo(
    () => initialEntries.filter((e) => matchesQuery(e, query)),
    [initialEntries, query],
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      let r: Awaited<ReturnType<typeof deleteContractArchiveAction>> | null = null;
      try {
        r = await deleteContractArchiveAction({ id });
      } catch (e) {
        captureActionError('contract-archive.delete', e);
        toast('계약서를 지우지 못했어요', { type: 'error' });
      }
      // 확인창은 성공·실패·throw 어느 쪽이든 닫는다 — 열린 채 굳으면 빠져나갈 길이 없다.
      setDeleteTarget(null);
      if (!r) return;
      if (!r.ok) {
        toast(contractArchiveErrorMessage(r.error, '계약서를 지우지 못했어요'), { type: 'error' });
        return;
      }
      toast('계약서를 지웠어요', { type: 'success' });
      router.refresh();
    });
  };

  const isEmpty = initialEntries.length === 0;

  return (
    <>
      <ContractArchiveUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          setUploadOpen(false);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="계약서를 지울까요?"
        description={`"${deleteTarget?.title ?? ''}"이(가) 보관함에서 영구히 사라져요.`}
        confirmLabel="지울게요"
        variant="danger"
        onConfirm={handleDelete}
        loading={pending}
      />

      <PageHeader
        title="계약 보관함"
        count={isEmpty ? undefined : initialEntries.length}
        description="전자서명이 끝난 계약서와 직접 올린 계약서를 한자리에서 보관해요."
        action={
          isEmpty ? undefined : (
            <Button
              type="button"
              size="sm"
              variant="outlined"
              icon={<PlusIcon />}
              onClick={() => setUploadOpen(true)}
            >
              계약서 올리기
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-auto px-6 py-4">
        {loadFailed ? (
          // 로드 실패는 빈 상태가 아니다 — "없어요"로 위장하면 사용자는 계약서가
          // 사라진 줄 안다. 실패를 말하고 재시도 경로를 준다.
          <EmptyState
            icon={<FileSignatureIcon />}
            title="목록을 불러오지 못했어요"
            description="잠시 후 다시 시도해 주세요."
            action={
              <Button type="button" variant="outlined" size="md" onClick={() => router.refresh()}>
                다시 불러오기
              </Button>
            }
          />
        ) : isEmpty ? (
          <EmptyState
            icon={<FileSignatureIcon />}
            title="아직 보관된 계약서가 없어요"
            description="전자서명이 끝나면 완료본과 감사추적인증서가 자동으로 들어와요. 플랫폼 밖에서 맺은 계약서는 직접 올릴 수 있어요."
            action={
              <Button
                type="button"
                variant="filled"
                size="md"
                icon={<PlusIcon />}
                onClick={() => setUploadOpen(true)}
              >
                계약서 올리기
              </Button>
            }
          />
        ) : (
          <>
            <label className="relative mb-3 block">
              <span className="sr-only">계약서 검색</span>
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-on-surface-variant)]"
                size={16}
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="제목·상대방으로 찾기"
                className="h-8 w-full max-w-xs rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] pl-8 pr-2 text-sm outline-none focus-visible:border-[var(--md-sys-color-primary)]"
              />
            </label>

            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
                검색 결과가 없어요.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                {rows.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{e.title}</span>
                        <Chip
                          color={e.source === 'signing' ? 'tertiary' : 'surface'}
                          label={e.source === 'signing' ? '전자서명 완료' : '직접 업로드'}
                        />
                        <StatusChip status={e.status} />
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                        <span className="truncate">{e.counterpartyName ?? '상대방 미상'}</span>
                        <span aria-hidden>·</span>
                        <span className="md-numeric">{formatDate(e.contractedAt)}</span>
                        {e.rfpCode ? (
                          <>
                            <span aria-hidden>·</span>
                            {/* 딜이 죽었으면 링크가 아니라 텍스트다 — 404 로 보내지 않는다. */}
                            {e.dealHref ? (
                              <Link href={e.dealHref} className="md-numeric hover:underline">
                                {e.rfpCode}
                              </Link>
                            ) : (
                              <span className="md-numeric">{e.rfpCode}</span>
                            )}
                          </>
                        ) : null}
                      </div>
                    </div>

                    {e.status === 'ready' ? (
                      <div className="flex shrink-0 items-center gap-2 text-xs">
                        <a
                          href={`/api/contract-archives/${e.id}/download?doc=document`}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container)]"
                        >
                          <ArrowDownIcon size={14} aria-hidden />
                          계약서
                        </a>
                        {e.hasAudit ? (
                          <a
                            href={`/api/contract-archives/${e.id}/download?doc=audit`}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container)]"
                          >
                            <ArrowDownIcon size={14} aria-hidden />
                            인증서
                          </a>
                        ) : null}
                      </div>
                    ) : null}

                    {/* 보존 원칙 — 자동 보관본에는 버튼 자체를 렌더하지 않는다(서버가 SSOT). */}
                    {e.canDelete ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="text"
                        onClick={() => setDeleteTarget(e)}
                      >
                        삭제
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  );
}
