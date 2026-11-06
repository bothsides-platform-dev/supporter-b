'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useDemoNavigate, useNavSearchParams } from '@/lib/nav/demo-nav-context';
import { InboxList, type InboxRow } from './InboxList';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState } from '@/components/primitives/EmptyState';
import { InboxIcon } from '@/components/icons';
import { MERCHANT_TIER_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/types/bid';
import { INBOX_VIEWS, INBOX_PAGE_SIZE } from '@/lib/rfp/inbox-query';
import { useDealRoomNav } from '@/lib/stores/deal-room-nav';

const control =
  'min-h-9 rounded-[6px] border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-background)] px-2 text-[14px] focus-visible:outline-2 focus-visible:outline-[var(--md-sys-color-primary)]';
export function InboxPageContent({
  rows,
  totalCount,
  onOpenRfp,
  preview,
  selected,
  order,
  counts,
  page = 1,
  pages = 1,
  filteredCount,
  industries = [],
}: {
  rows: InboxRow[];
  totalCount: number;
  onOpenRfp?: (rfpId: string, tab?: 'write') => void;
  preview?: ReactNode;
  selected?: string;
  order?: string[];
  counts?: Record<string, number>;
  page?: number;
  pages?: number;
  filteredCount?: number;
  industries?: string[];
}) {
  const router = useRouter();
  const sp = useNavSearchParams();
  const demoNavigate = useDemoNavigate();
  const navigate = (href: string) =>
    demoNavigate ? demoNavigate(href) : router.push(href, { scroll: false });
  const query = sp.get('q') ?? '';
  const [input, setInput] = useState({ query, value: query });
  const search = input.query === query ? input.value : query;
  const setSearch = (value: string) => setInput({ query, value });
  const list = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const previous = useRef(selected);
  const scroll = useRef(0);
  const setOrder = useDealRoomNav((s) => s.setOrder);
  useEffect(() => {
    if (order) setOrder('/inbox', order);
  }, [order, setOrder]);
  useEffect(() => {
    if (selected) {
      if (!previous.current) scroll.current = list.current?.scrollTop ?? 0;
      panel.current?.focus();
    } else if (previous.current) {
      if (list.current) list.current.scrollTop = scroll.current;
      list.current
        ?.querySelector<HTMLElement>(`[data-inbox-row="${CSS.escape(previous.current)}"]`)
        ?.focus({ preventScroll: true });
    }
    previous.current = selected;
  }, [selected]);
  const update = (changes: Record<string, string | undefined>, filter = false) => {
    const next = new URLSearchParams(sp.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (filter) {
      next.delete('page');
      next.delete('selected');
    }
    navigate(`/inbox${next.size ? `?${next}` : ''}`);
  };
  const select = (id: string) => {
    const index = (order ?? rows.map((r) => r.rfpId)).indexOf(id);
    update({
      selected: id,
      page: String(Math.floor(Math.max(0, index) / INBOX_PAGE_SIZE) + 1),
    });
  };
  const open = (id: string, tab?: 'write') => {
    if (onOpenRfp && tab) {
      onOpenRfp(id, tab);
      return;
    }
    if (tab) router.push(`/inbox/${id}?tab=write`, { scroll: false });
    else select(id);
  };
  const index = (order ?? []).indexOf(selected ?? '');
  return (
    <>
      <PageHeader title="받은 견적 요청" count={filteredCount ?? rows.length} />
      <div className="shrink-0 space-y-3 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
        <nav aria-label="업무 뷰" className="flex gap-1 overflow-x-auto">
          {INBOX_VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              aria-current={(sp.get('status') ?? '') === v.value ? 'page' : undefined}
              onClick={() => update({ status: v.value }, true)}
              className={`min-h-9 shrink-0 rounded-[6px] px-3 text-[14px] ${(sp.get('status') ?? '') === v.value ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]' : 'hover:bg-[var(--md-sys-color-surface-container)]'}`}
            >
              {v.label}
              {counts && <span className="md-numeric ml-1">{counts[v.value] ?? 0}</span>}
            </button>
          ))}
        </nav>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: search.trim() }, true);
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            aria-label="구매사명·제목·요청 번호 검색"
            placeholder="구매사명·제목·요청 번호"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${control} w-64 max-w-full`}
          />
          <button type="submit" className={control}>
            검색
          </button>
          <select
            aria-label="업종 필터"
            className={control}
            value={sp.get('industry') ?? ''}
            onChange={(e) => update({ industry: e.target.value }, true)}
          >
            <option value="">모든 업종</option>
            {industries.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
          <select
            aria-label="결제수단 필터"
            className={control}
            value={sp.get('method') ?? ''}
            onChange={(e) => update({ method: e.target.value }, true)}
          >
            <option value="">모든 결제수단</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            aria-label="등급 필터"
            className={control}
            value={sp.get('grade') ?? ''}
            onChange={(e) => update({ grade: e.target.value }, true)}
          >
            <option value="">모든 등급</option>
            {Object.entries(MERCHANT_TIER_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            aria-label="정렬"
            className={control}
            value={sp.get('sort') ?? 'priority'}
            onChange={(e) => update({ sort: e.target.value }, true)}
          >
            <option value="priority">업무 우선</option>
            <option value="deadline">마감순</option>
            <option value="recent">최근 접수순</option>
          </select>
          <label className="flex items-center gap-1 text-[13px]">
            응답 마감{' '}
            <input
              aria-label="마감 시작일"
              type="date"
              className={control}
              value={sp.get('from') ?? ''}
              onChange={(e) => update({ from: e.target.value }, true)}
            />
          </label>
          <label className="flex items-center gap-1 text-[13px]">
            ~{' '}
            <input
              aria-label="마감 종료일"
              type="date"
              className={control}
              value={sp.get('to') ?? ''}
              onChange={(e) => update({ to: e.target.value }, true)}
            />
          </label>
          {sp.size > 0 && (
            <button
              type="button"
              className="px-2 text-[14px] underline"
              onClick={() => {
                setSearch('');
                navigate('/inbox');
              }}
            >
              필터 초기화
            </button>
          )}
        </form>
      </div>
      <div className="flex min-h-0 flex-1">
        <div
          ref={list}
          className={`min-w-0 flex-1 overflow-y-auto ${selected ? 'hidden lg:block' : ''}`}
        >
          {rows.length ? (
            <InboxList rows={rows} onOpenRfp={open} selected={selected} compact={!!selected} />
          ) : (
            <EmptyState
              icon={<InboxIcon />}
              title={
                totalCount ? '조건에 맞는 견적 요청이 없어요.' : '아직 받은 견적 요청이 없어요.'
              }
              description={
                totalCount
                  ? '검색어나 필터를 바꾸면 다른 요청을 볼 수 있어요.'
                  : '구매사가 요청한 견적이 여기에 표시돼요.'
              }
            />
          )}
          {pages > 1 && (
            <nav
              aria-label="페이지 이동"
              className="flex items-center justify-center gap-4 p-4 text-[14px]"
            >
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => update({ page: String(page - 1), selected: undefined })}
                className={control}
              >
                이전 페이지
              </button>
              <span className="md-numeric">
                {page} / {pages}
              </span>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => update({ page: String(page + 1), selected: undefined })}
                className={control}
              >
                다음 페이지
              </button>
            </nav>
          )}
        </div>
        {selected && (
          <aside
            ref={panel}
            tabIndex={-1}
            aria-label="견적 요청 미리보기"
            className="min-w-0 flex-1 overflow-y-auto border-l border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-background)] lg:w-[480px] lg:flex-none min-[90rem]:w-[560px]"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                update({ selected: undefined });
              }
            }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-3">
              <button
                type="button"
                className={control}
                onClick={() => update({ selected: undefined })}
              >
                목록으로 · 닫기
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={control}
                  disabled={index <= 0}
                  onClick={() => select(order![index - 1])}
                >
                  이전 요청
                </button>
                <button
                  type="button"
                  className={control}
                  disabled={index < 0 || index >= (order?.length ?? 0) - 1}
                  onClick={() => select(order![index + 1])}
                >
                  다음 요청
                </button>
              </div>
            </div>
            {preview}
          </aside>
        )}
      </div>
    </>
  );
}
