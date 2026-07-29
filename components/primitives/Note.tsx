import { Info } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Note — 목록·패널 아래 붙는 한 줄 보조 안내 (아이콘 + 문구).
 * 아이콘은 장식이라 AT 에서 배제한다 — 의미는 문구가 전부 진다. 아이콘만 바꿔
 * 끼울 수 있게 열어 뒀다(자물쇠 등); 열지 않으면 호출부가 같은 문법을 손으로
 * 다시 만들어 간격·크기가 갈린다.
 * 바깥 여백은 호출부가 소유한다(프리미티브는 margin 을 갖지 않는다).
 */
export function Note({
  children,
  icon,
  className,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
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
      <span
        data-testid="note-icon"
        aria-hidden
        className="mt-px shrink-0 [&_svg]:size-3.5"
      >
        {icon ?? <Info />}
      </span>
      <span>{children}</span>
    </div>
  );
}
