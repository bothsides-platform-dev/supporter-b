import { cn } from '@/lib/utils';

export type LabelSize = 'lg' | 'md' | 'sm';

type LabelProps = {
  children: React.ReactNode;
  size?: LabelSize;
  className?: string;
  muted?: boolean;
  as?: 'span' | 'p' | 'label' | 'legend' | 'div';
  /** `as="label"` 일 때 입력과 묶는다 — 없으면 입력에 접근 가능한 이름이 안 붙는다. */
  htmlFor?: string;
};

// DESIGN.md §3 라벨 유틸리티(app/globals.css). 같은 값을 토큰 나열형으로 다시
// 쓰지 않는다 — 표기가 둘이 되면 다음 사람이 어느 쪽을 따를지 모른다.
const sizeMap: Record<LabelSize, string> = {
  lg: 'md-label-large',
  md: 'md-label-medium',
  sm: 'md-label-small',
};

export function Label({ children, size = 'md', className, muted = true, as: Tag = 'span', htmlFor }: LabelProps) {
  return (
    <Tag htmlFor={Tag === 'label' ? htmlFor : undefined} className={cn(
      sizeMap[size],
      muted ? 'text-[var(--md-sys-color-on-surface-variant)]' : 'text-[var(--md-sys-color-on-surface)]',
      className,
    )}>
      {children}
    </Tag>
  );
}
