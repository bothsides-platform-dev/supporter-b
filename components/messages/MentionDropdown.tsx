// 멘션 자동완성 드롭다운(프레젠테이션). 각 행 = 아바타 + 이름 [+ 동명이인 합류일자].
// '@전체' 행은 그룹 아이콘. 키보드 상태(activeIndex)는 부모가 소유.
import { Avatar } from '@/components/primitives/Avatar';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import type { MentionItem } from './mention-input';

type Props = {
  items: MentionItem[];
  activeIndex: number;
  duplicateNames: Set<string>;
  onPick: (item: MentionItem) => void;
  onHover: (index: number) => void;
};

export function MentionDropdown({ items, activeIndex, duplicateNames, onPick, onHover }: Props) {
  if (items.length === 0) return null;
  return (
    <ul
      role="listbox"
      aria-label="멘션 대상"
      className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-64 overflow-y-auto rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] py-1 shadow-lg"
    >
      {items.map((item, i) => {
        const active = i === activeIndex;
        const key = item.kind === 'all' ? 'all' : item.userId;
        return (
          <li
            key={key}
            role="option"
            aria-selected={active}
            // onMouseDown(preventDefault): textarea 포커스를 잃지 않고 선택.
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(item);
            }}
            onMouseEnter={() => onHover(i)}
            className={cn(
              'flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[13px]',
              active && 'bg-[var(--md-sys-color-surface-container-highest)]',
            )}
          >
            {item.kind === 'all' ? (
              <>
                <span className="flex size-6 items-center justify-center rounded-[var(--md-sys-shape-full)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                  <Users size={14} strokeWidth={1.5} />
                </span>
                <span className="font-medium text-[var(--md-sys-color-on-surface)]">전체</span>
              </>
            ) : (
              <>
                <Avatar name={item.name} size="sm" color="surface" userId={item.userId} avatarUpdatedAt={item.avatarUpdatedAt} />
                <span className="text-[var(--md-sys-color-on-surface)]">{item.name}</span>
                {duplicateNames.has(item.name) && (
                  <span className="md-numeric ml-auto text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    {formatDate(item.joinedAt)}
                  </span>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
