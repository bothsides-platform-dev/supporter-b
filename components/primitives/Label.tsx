import { cn } from '@/lib/utils';

export type LabelSize = 'lg' | 'md' | 'sm';

type LabelTag = 'span' | 'p' | 'label' | 'legend' | 'div';

type LabelBase = {
  children: React.ReactNode;
  size?: LabelSize;
  className?: string;
  muted?: boolean;
};

/**
 * `htmlFor` 는 `as="label"` 과 **짝으로만** 표현 가능하다.
 *
 * 이전에는 둘이 독립 옵션이라 `<Label htmlFor="x">` 가 컴파일을 통과한 뒤 렌더에서
 * 속성이 조용히 사라졌다 — span 의 htmlFor 는 무의미한 HTML 이라 떨어뜨리는 게
 * 맞지만, 호출부는 라벨을 묶었다고 믿고 입력에는 접근 가능한 이름이 안 붙어
 * 스크린리더가 placeholder 를 읽었다. 주석으로 적어 둔 규율은 실제로 한 곳에서
 * 깨져 있었다(ClauseTemplateEditor). 타입으로 옮겨 재발을 컴파일 에러로 만든다.
 */
type LabelProps = LabelBase &
  (
    | { as: 'label'; htmlFor: string }
    | { as?: Exclude<LabelTag, 'label'>; htmlFor?: never }
  );

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
