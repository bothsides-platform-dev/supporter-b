import { cn } from '@/lib/utils';

/**
 * 타이핑·인라인 로딩 인디케이터 — staggered 펄스 점 3개.
 * 접근성: role=status + aria-label. motion-reduce 에서 정지.
 */
export function TypingDots({ className, label = '입력 중' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex items-center gap-1', className)}>
      <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-[var(--md-sys-color-on-surface-variant)] [animation-delay:0ms] motion-reduce:animate-none" />
      <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-[var(--md-sys-color-on-surface-variant)] [animation-delay:150ms] motion-reduce:animate-none" />
      <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-[var(--md-sys-color-on-surface-variant)] [animation-delay:300ms] motion-reduce:animate-none" />
    </span>
  );
}
