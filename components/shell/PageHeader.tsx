import { cn } from '@/lib/utils';
import { UNREAD_LABEL } from '@/lib/types/notification';

type PageHeaderProps = {
  title: string;
  count?: number;
  /**
   * 칩이 무엇을 세는지. 기본 `'total'` 은 목록 길이(중립톤).
   *
   * `'unread'` 는 미읽음 수다 — 사이드바 알림 배지 바로 옆에 서는 숫자라
   * DESIGN.md §7.3 하드룰("읽지 않음은 항상 primary")의 적용 대상이 된다.
   * "0 이면 중립톤" 판단을 호출부마다 복제하지 않도록 분기는 여기 안에만 둔다.
   */
  countKind?: 'total' | 'unread';
  /** 페이지가 무엇을 하는 곳인지 한 줄 설명. 넘기면 스트립이 2행으로 늘어난다. */
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

/**
 * 개수 칩. `kind='unread'` 이고 셀 것이 남았을 때만 primary 로 칠한다.
 *
 * 접근 가능한 이름은 `aria-label` 이 아니라 `sr-only` 텍스트로 준다 — ARIA 1.2 는
 * role 이 generic 인 요소(맨 `<span>`)에 `aria-label` 을 금지하고 스크린리더 동작이
 * 들쭉날쭉하다. 사이드바 배지가 `aria-label` 로 되는 것은 그 배지가 `<a>` 안에 있어
 * name-from-content 순회에 걸리기 때문이고, 이 칩에는 그런 조상이 없다.
 */
function CountPill({ count, kind }: { count: number; kind: 'total' | 'unread' }) {
  const unread = kind === 'unread';
  const highlight = unread && count > 0;

  return (
    <span
      data-testid="page-header-count"
      className={cn(
        'inline-flex h-5 min-w-[20px] items-center justify-center rounded-[var(--md-sys-shape-extra-small)] px-1.5 text-[length:var(--md-typescale-label-small-size)] font-medium',
        highlight
          ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
          : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]',
        // 미읽음 칩은 라벨 span 이 섞이므로 tabular-nums 를 숫자에만 건다.
        !unread && 'md-numeric',
      )}
    >
      {unread ? (
        <>
          <span className="sr-only">{UNREAD_LABEL} </span>
          <span className="md-numeric">{count}</span>
          <span className="sr-only">건</span>
        </>
      ) : (
        count
      )}
    </span>
  );
}

/**
 * PageHeader — lightweight list-page header.
 * Renders: title (h1) + optional count pill + optional right-side action slot,
 * and an optional one-line description below them.
 * Follows Linear density: 48px strip (description 없을 때), 16px body baseline, outline-variant border.
 */
export function PageHeader({
  title,
  count,
  countKind = 'total',
  description,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'border-b border-[var(--md-sys-color-outline-variant)] px-6',
        className,
      )}
    >
      <div
        data-testid="page-header-row"
        className={cn('flex items-center gap-3', description ? 'pt-3' : 'h-12')}
      >
        <h1 className="text-[length:var(--md-typescale-title-medium-size)] font-[number:var(--md-typescale-title-medium-weight)] tracking-[var(--md-typescale-title-medium-tracking)] text-[var(--md-sys-color-on-surface)]">
          {title}
        </h1>

        {count !== undefined && <CountPill count={count} kind={countKind} />}

        {action && (
          <div data-testid="page-header-action" className="ml-auto">
            {action}
          </div>
        )}
      </div>

      {description && (
        <p
          data-testid="page-header-description"
          className="pb-3 pt-1 text-[length:var(--md-typescale-body-medium-size)] text-[var(--md-sys-color-on-surface-variant)]"
        >
          {description}
        </p>
      )}
    </div>
  );
}
