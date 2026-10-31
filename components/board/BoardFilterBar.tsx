'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useNavPathname, useNavSearchParams, useDemoNavigate } from '@/lib/nav/demo-nav-context';

type Option = { value: string; label: string };

const DEADLINE_OPTIONS: Option[] = [
  { value: 'd7', label: '마감임박' },
  { value: 'month', label: '이번달' },
  { value: 'overdue', label: '지난마감' },
];

export function BoardFilterBar({
  statusOptions,
  gradeOptions,
  searchPlaceholder,
  variant = 'default',
}: {
  statusOptions: Option[];
  gradeOptions: Option[];
  searchPlaceholder?: string;
  variant?: 'default' | 'inbox';
}) {
  const router = useRouter();
  // 랜딩 데모 안에서는 실제 URL 을 건드리면 방문자가 랜딩을 이탈한다. 데모 nav
  // 컨텍스트가 있으면 그쪽으로 보내고, 없으면(=실제 앱) 평소처럼 router.replace.
  // DemoSidebar 와 같은 opt-in no-op 패턴이라 프로덕션 동작은 그대로다.
  const pathname = useNavPathname();
  const searchParams = useNavSearchParams();
  const demoNavigate = useDemoNavigate();

  const current = (key: string) => searchParams.get(key) ?? '';

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    if (demoNavigate) demoNavigate(href);
    else router.replace(href);
  };

  const inbox = variant === 'inbox';
  const statusFilters = <ChipGroup
        param="status"
        label="상태"
        options={statusOptions}
        current={current('status')}
        onSelect={setParam}
      />;

  return (
    <div className={inbox ? 'flex flex-col gap-3' : 'flex flex-wrap items-center gap-3'} role="group" aria-label="필터">
      {inbox && statusFilters}
      <div className={inbox ? 'flex flex-wrap items-center gap-2' : 'contents'}>
        {searchPlaceholder && (
          <form role="search" className={cn("flex w-full gap-2", inbox && "sm:w-auto sm:min-w-64 sm:flex-1")} onSubmit={e => {
            e.preventDefault();
            setParam('q', String(new FormData(e.currentTarget).get('q') ?? '').trim());
          }}>
            <input key={current('q')} type="search" name="q" aria-label={searchPlaceholder} placeholder={searchPlaceholder} defaultValue={current('q')}
              className="min-h-11 min-w-0 flex-1 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 text-[14px] sm:min-h-8" />
            <button type="submit" className="rounded-[6px] px-3 text-[14px] text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container)]">검색</button>
          </form>
        )}
        {!inbox && statusFilters}
        <ChipGroup
          param="deadline"
          label="마감일"
          options={DEADLINE_OPTIONS}
          current={current('deadline')}
          onSelect={setParam}
        />
        <select
          aria-label="가맹점 등급"
          value={current('grade')}
          onChange={(e) => setParam('grade', e.target.value)}
          className="min-h-11 sm:min-h-8 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-2 text-[13px] text-[var(--md-sys-color-on-surface)]"
        >
          <option value="">등급 전체</option>
          {gradeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {inbox && <BoardFilterReset />}
      </div>
    </div>
  );
}

function ChipGroup({
  param,
  label,
  options,
  current,
  onSelect,
}: {
  param: string;
  label: string;
  options: Option[];
  current: string;
  onSelect: (key: string, value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      {options.map((o) => {
        const active = current === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(param, active ? '' : o.value)}
            className={cn(
              'min-h-11 sm:min-h-8 cursor-pointer px-2.5 rounded-[var(--md-sys-shape-small)] border text-[13px] transition-colors duration-[var(--md-sys-motion-duration-short-4)]',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-sys-color-primary)]/50',
              active
                ? 'border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-primary)]'
                : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Preserve navigation parameters unrelated to the list's four filters. */
export function BoardFilterReset() {
  const router = useRouter();
  const pathname = useNavPathname();
  const searchParams = useNavSearchParams();
  const demoNavigate = useDemoNavigate();
  const keys = ['q', 'status', 'deadline', 'grade'];
  return (
    <button type="button" disabled={!keys.some(key => searchParams.has(key))}
      className="min-h-11 rounded-[6px] px-3 text-[14px] text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container)] disabled:opacity-50 sm:min-h-8"
      onClick={() => {
        const params = new URLSearchParams(searchParams.toString());
        keys.forEach(key => params.delete(key));
        const query = params.toString();
        const href = query ? `${pathname}?${query}` : pathname;
        if (demoNavigate) demoNavigate(href);
        else router.replace(href);
      }}>필터 초기화</button>
  );
}
