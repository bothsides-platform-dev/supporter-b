'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { ArrowDownIcon, FileSignatureIcon, PlusIcon, SearchIcon } from '@/components/icons';
import { Button } from '@/components/primitives/Button';
import { Chip } from '@/components/primitives/Chip';
import { EmptyState } from '@/components/primitives/EmptyState';
import { PageHeader } from '@/components/shell/PageHeader';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LocalDate } from '@/components/primitives/LocalTime';
import { ContractArchiveUploadDialog } from './ContractArchiveUploadDialog';
import { NEW_TAB_DOWNLOAD_NOTICE } from '@/lib/a11y/link-notice';
import { captureActionError } from '@/lib/observability/capture';
import { contractArchiveErrorMessage } from '@/lib/contract-archive/error-messages';
import { toast } from '@/lib/toast';
import { deleteContractArchiveAction, listContractArchivesAction } from '@/lib/server/actions/contract-archive';
import type { ContractArchiveCursor, ContractArchiveEntry } from '@/lib/types/contract-archive';

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
  initialNextCursor = null,
  loadFailed = false,
}: {
  initialEntries: ContractArchiveEntry[];
  initialNextCursor?: ContractArchiveCursor | null;
  loadFailed?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState(initialEntries);
  const [cursor, setCursor] = useState(initialNextCursor);
  const [loadedQuery, setLoadedQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const searchVersion = useRef(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContractArchiveEntry | null>(null);

  useEffect(() => {
    const version = searchVersion.current;
    const normalized = query.trim();
    if (normalized === loadedQuery) return;
    const timer = window.setTimeout(async () => {
      try {
        const result = await listContractArchivesAction({ query: normalized });
        if (version !== searchVersion.current) return;
        if (result.ok) {
          setEntries(result.rows);
          setCursor(result.nextCursor);
          setLoadedQuery(normalized);
        } else {
          toast('목록을 불러오지 못했어요', { type: 'error' });
          setQuery(loadedQuery);
        }
      } catch (error) {
        if (version !== searchVersion.current) return;
        captureActionError('contract-archive.search', error);
        toast('목록을 불러오지 못했어요', { type: 'error' });
        setQuery(loadedQuery);
      } finally {
        if (version === searchVersion.current) setIsSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, loadedQuery]);

  async function loadMore() {
    if (!cursor || loadingMore || isSearching) return;
    const version = searchVersion.current;
    setLoadingMore(true);
    try {
      const result = await listContractArchivesAction({ before: cursor, ...(loadedQuery ? { query: loadedQuery } : {}) });
      if (version !== searchVersion.current) return;
      if (!result.ok) {
        toast('목록을 불러오지 못했어요', { type: 'error' });
        return;
      }
      setEntries((previous) => {
        const seen = new Set(previous.map((entry) => entry.id));
        return [...previous, ...result.rows.filter((entry) => !seen.has(entry.id))];
      });
      setCursor(result.nextCursor);
    } catch (error) {
      if (version === searchVersion.current) {
        captureActionError('contract-archive.load-more', error);
        toast('목록을 불러오지 못했어요', { type: 'error' });
      }
    } finally {
      setLoadingMore(false);
    }
  }

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

  const isEmpty = entries.length === 0 && loadedQuery === '' && !isSearching;

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
        description={`"${deleteTarget?.title ?? ''}" 계약서가 보관함에서 영구히 사라져요.`}
        confirmLabel="지울게요"
        variant="danger"
        onConfirm={handleDelete}
        loading={pending}
      />

      <PageHeader
        title="계약 보관함"
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
                onChange={(e) => {
                  const nextQuery = e.target.value;
                  searchVersion.current += 1;
                  setQuery(nextQuery);
                  setIsSearching(nextQuery.trim() !== loadedQuery);
                }}
                maxLength={100}
                placeholder="제목·상대방으로 찾기"
                className="h-8 w-full max-w-xs rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] pl-8 pr-2 text-sm outline-none focus-visible:border-[var(--md-sys-color-primary)]"
              />
            </label>

            {isSearching ? (
              <p className="py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
                검색 중…
              </p>
            ) : entries.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
                검색 결과가 없어요.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
                {entries.map((e) => (
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
                        <span className="truncate">{e.counterpartyName ?? '—'}</span>
                        <span aria-hidden>·</span>
                        {/* `LocalDate` 를 쓰는 이유: `contracted_at` 은 timestamptz 라
                            브라우저 로컬 게터로 읽으면 서버(UTC)와 클라(KST)가 다른 날짜를
                            렌더해 하이드레이션이 어긋나고 날짜 자체가 틀린다. */}
                        <span className="md-numeric">
                          {e.contractedAt ? <LocalDate iso={e.contractedAt} /> : '—'}
                        </span>
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
                          className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1.5 text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container)]"
                        >
                          <ArrowDownIcon size={14} aria-hidden />
                          계약서
                          {/* 아이콘은 aria-hidden 이라 "새 탭에서 내려받는다"는 사실이
                              접근성 이름에 실리지 않는다 — sr-only 로 덧붙인다
                              (WCAG 2.4.4 / G201, 레포 전역 규칙). */}
                          <span className="sr-only">{NEW_TAB_DOWNLOAD_NOTICE}</span>
                        </a>
                        {e.hasAudit ? (
                          <a
                            href={`/api/contract-archives/${e.id}/download?doc=audit`}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1.5 text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container)]"
                          >
                            <ArrowDownIcon size={14} aria-hidden />
                            인증서
                            <span className="sr-only">{NEW_TAB_DOWNLOAD_NOTICE}</span>
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
                        color="error"
                        onClick={() => setDeleteTarget(e)}
                      >
                        삭제
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {cursor && !isSearching ? (
              <div className="flex justify-center pt-4">
                <Button type="button" variant="outlined" size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? '불러오는 중…' : '더 보기'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
