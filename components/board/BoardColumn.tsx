'use client';

import { memo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useDroppable } from '@dnd-kit/core';
import { generateKeyBetween } from 'fractional-indexing';
import { addColumnAction } from '@/lib/server/actions/board/addColumnAction';
import { deleteColumnAction } from '@/lib/server/actions/board/deleteColumnAction';
import { renameColumnAction } from '@/lib/server/actions/board/renameColumnAction';
import { recolorColumnAction } from '@/lib/server/actions/board/recolorColumnAction';
import { toast } from '@/lib/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { BoardDraggableCard } from './BoardDraggableCard';
import {
  type BoardCard,
  type BoardColumn as BoardColumnType,
  type ChipColorRole,
  type ColumnKind,
  isSystemColumn,
} from '@/lib/types/column';

// Set to true to re-enable the custom-column UI (add/delete column controls).
export const CUSTOM_COLUMNS_ENABLED = false;

const dotClass: Record<ChipColorRole, string> = {
  surface: 'bg-[var(--md-sys-color-outline-variant)]',
  primary: 'bg-[var(--md-sys-color-primary)]',
  tertiary: 'bg-[var(--md-sys-color-tertiary)]',
  warning: 'bg-[var(--md-sys-color-warning)]',
  error: 'bg-[var(--md-sys-color-error)]',
};

const COLOR_CHOICES: (ChipColorRole | null)[] = [
  null,
  'primary',
  'tertiary',
  'warning',
  'error',
];

// cards+renderCard+moreHref 를 받아 내부에서 카드 목록을 렌더링한다.
// 부모가 카드 데이터와 안정 renderCard 를 넘기고 BoardDraggableCard 도 같은 패턴이므로
// memo 가 컬럼·카드 단위로 bail 한다 — 다른 컬럼의 리렌더가 이 컬럼에 전파되지 않는다.
// 컬럼별 zero-arg 클로저는 이 컴포넌트 내부에서만 만든다.
function BoardColumnInner({
  column,
  count,
  dropState,
  cards,
  renderCard,
  moreHref,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onRefresh,
}: {
  column: BoardColumnType;
  count: number;
  /** 드래그 중 드롭 가능 여부 — invalid 컬럼은 dim, isOver 강조는 valid 만. */
  dropState: 'idle' | 'valid' | 'invalid';
  cards: BoardCard[];
  renderCard: (card: BoardCard) => ReactNode;
  /** 표에서 전체 보기 링크 URL — null 이면 표시하지 않음 (종결 컬럼 overflow 전용). */
  moreHref: string | null;
  menuOpen: boolean;
  onToggleMenu: (columnId: string) => void;
  onCloseMenu: () => void;
  onRefresh: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.id}` });

  return (
    <section
      ref={setNodeRef}
      data-column-title={column.title}
      className={cn(
        'flex flex-col w-72 shrink-0 snap-start bg-[var(--md-sys-color-surface-container)] rounded-[var(--md-sys-shape-medium)] p-3 min-h-[400px] transition-[background-color,opacity]',
        dropState === 'invalid' && 'opacity-40',
        isOver &&
          dropState === 'valid' &&
          'bg-[var(--md-sys-color-surface-container-high)] outline outline-1 outline-dashed outline-[var(--md-sys-color-outline)]',
      )}
    >
      <header className="relative flex items-center justify-between gap-2 mb-3 px-1">
        <div className="flex items-center gap-2">
          <span
            className={cn('inline-block h-2 w-2 rounded-full', dotClass[column.color ?? 'surface'])}
          />
          <span className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
            {column.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="md-numeric text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
            {count}
          </span>
          <button
            type="button"
            aria-label={`${column.title} 컬럼 메뉴`}
            onClick={() => onToggleMenu(column.id)}
            className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] text-[14px] leading-none px-1"
          >
            ⋯
          </button>
        </div>
        {menuOpen && (
          <ColumnMenu column={column} onClose={onCloseMenu} onRefresh={onRefresh} />
        )}
      </header>
      <div className="flex-1 flex flex-col gap-2">
        {count === 0 && (
          <p className="text-center py-8 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            —
          </p>
        )}
        {cards.map((card) => (
          <BoardDraggableCard key={card.cardId} card={card} renderCard={renderCard} />
        ))}
        {moreHref !== null && (
          // 라벨에 건수를 넣지 않는다 — 보드의 N(필터 적용·컬럼 폴드)과 표 도착지
          // 건수가 다를 수 있어 약속이 어긋남. 총 건수는 컬럼 헤더가 이미 보여줌.
          <Link
            href={moreHref}
            className="block text-center py-2 text-[12px] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          >
            표에서 전체 보기
          </Link>
        )}
      </div>
    </section>
  );
}

export const BoardColumn = memo(BoardColumnInner);

function ColumnMenu({
  column,
  onClose,
  onRefresh,
}: {
  column: BoardColumnType;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [title, setTitle] = useState(column.title);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) {
        toast(`처리하지 못했어요 — ${r.error}`, { type: 'error' });
        return;
      }
      onClose();
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(false)}
        title="컬럼을 삭제할까요?"
        description="컬럼 안의 카드는 자동 분류로 되돌아갑니다."
        confirmLabel="삭제"
        variant="danger"
        onConfirm={() => run(() => deleteColumnAction({ columnId: column.id }))}
        loading={busy}
      />
      <div className="absolute right-0 top-7 z-10 w-56 rounded-[var(--md-sys-shape-medium)] bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-2)] p-3 flex flex-col gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim() && title !== column.title)
              run(() => renameColumnAction({ columnId: column.id, title: title.trim() }));
            else onClose();
          }}
        >
          <input
            aria-label="컬럼 이름"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            className="w-full text-[13px] bg-[var(--md-sys-color-surface)] rounded-[var(--md-sys-shape-small)] px-2 py-1 border border-[var(--md-sys-color-outline-variant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/40"
          />
        </form>

        <div className="flex items-center gap-1.5">
          {COLOR_CHOICES.map((c) => (
            <button
              key={c ?? 'none'}
              type="button"
              aria-label={`색상 ${c ?? '없음'}`}
              disabled={busy}
              onClick={() => run(() => recolorColumnAction({ columnId: column.id, color: c }))}
              className={cn(
                'h-4 w-4 rounded-full border border-[var(--md-sys-color-outline-variant)]',
                dotClass[c ?? 'surface'],
              )}
            />
          ))}
        </div>

        {isSystemColumn(column) || !CUSTOM_COLUMNS_ENABLED ? (
          <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            기본 컬럼 — 삭제할 수 없습니다
          </p>
        ) : (
          <button
            type="button"
            aria-label="컬럼 삭제"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="text-left text-[12px] text-[var(--md-sys-color-error)] hover:underline"
          >
            컬럼 삭제
          </button>
        )}
      </div>
    </>
  );
}

export function AddColumnControl({
  kind,
  afterPosition,
  onRefresh,
}: {
  kind: ColumnKind;
  afterPosition: string | null;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const position = generateKeyBetween(afterPosition, null);
      const r = await addColumnAction({ kind, title: title.trim(), position });
      if (!r.ok) {
        toast(`추가하지 못했어요 — ${r.error}`, { type: 'error' });
        return;
      }
      setTitle('');
      setOpen(false);
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 w-44 self-start mt-0 rounded-[var(--md-sys-shape-medium)] border border-dashed border-[var(--md-sys-color-outline-variant)] text-[13px] text-[var(--md-sys-color-on-surface-variant)] py-3 hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
      >
        + 열 추가
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="shrink-0 w-72 bg-[var(--md-sys-color-surface-container)] rounded-[var(--md-sys-shape-medium)] p-3"
    >
      <input
        autoFocus
        aria-label="새 컬럼 이름"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={busy}
        placeholder="컬럼 이름"
        className="w-full text-[13px] bg-[var(--md-sys-color-surface)] rounded-[var(--md-sys-shape-small)] px-2 py-1 border border-[var(--md-sys-color-outline-variant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/40"
      />
      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[12px] text-[var(--md-sys-color-on-surface-variant)] px-2 py-1"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="text-[12px] text-[var(--md-sys-color-primary)] px-2 py-1 disabled:opacity-40"
        >
          {busy ? 'LOADING…' : '추가'}
        </button>
      </div>
    </form>
  );
}
