import { cn } from '@/lib/utils';

/**
 * 펄스 스켈레톤 자리표시 블록 — 넓은 영역 로딩에 쓴다.
 * 크기·라운드는 className 으로 지정(기본 라운드 없음 — rounded-full/medium 등 호출부가 준다).
 * motion-reduce 에서 펄스를 끈다.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse bg-[var(--md-sys-color-surface-container-high)] motion-reduce:animate-none',
        className,
      )}
    />
  );
}
