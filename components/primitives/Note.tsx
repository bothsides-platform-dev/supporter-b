import { Info } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Note — 목록·패널 아래 붙는 한 줄 보조 안내 (Info 아이콘 + 문구).
 * 아이콘은 장식이라 AT 에서 배제한다 — 의미는 문구가 전부 진다.
 * 바깥 여백은 호출부가 소유한다(프리미티브는 margin 을 갖지 않는다).
 */
export function Note({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-testid="note"
      className={cn(
        'flex items-start gap-2 text-[length:var(--md-typescale-body-small-size)] text-[var(--md-sys-color-on-surface-variant)]',
        className,
      )}
    >
      <Info aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
