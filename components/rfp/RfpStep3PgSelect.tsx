'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { cn } from '@/lib/utils';
import { RequiredMark } from './RequiredMark';
import { isPgValid, markerState } from '@/lib/rfp/required-fields';
import { FieldError } from '@/components/primitives/FieldError';

// name is used server-side to compute displayName (dedup) and for avatar initials fallback;
// displayName is the visible label, logoUpdatedAt the workspace-logo cache-bust version.
export type PgWorkspace = {
  id: string;
  name: string;
  displayName: string;
  logoUpdatedAt: string | null;
};

type Props = {
  pgList: PgWorkspace[];
  onBack: () => void;
  onNext: () => void;
  showFieldErrors?: boolean;
};

// 칩은 raw <button> 이라 상호작용 값을 직접 실어야 한다 — Tailwind v4 Preflight 가
// button { cursor: default } 를 깔아두므로 빠지면 커서가 화살표로 남고 hover 가
// 끊기고 포커스 표시가 사라진다(DESIGN.md §Sidebar 푸터 행과 같은 규칙).
const chipBase = cn(
  'group inline-flex items-center gap-1.5 h-9 pl-2 pr-3 shrink-0',
  'rounded-[var(--md-sys-shape-small)] border text-[13px]',
  'cursor-pointer transition-colors duration-[var(--md-sys-motion-duration-short-4)]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50',
);

export function RfpStep3PgSelect({ pgList, onBack, onNext, showFieldErrors }: Props) {
  const draft = useRfpDraftStore();
  const [attempted, setAttempted] = useState(false);

  const selectedIds = new Set(draft.allowedPgWorkspaceIds.map((w) => w.id));
  const pgError = (attempted || !!showFieldErrors) && draft.allowedPgWorkspaceIds.length === 0;
  // 초안은 목록의 상위집합일 수 있다 — 테스트 PG 숨김(v0.4.53.0) 이후 도달
  // 가능하다. 그래서 화면을 말하는 값은 전부 이 교집합에서 나와야 한다:
  // 초안 개수를 쓰면 카운터가 `3/2` 가 되고, 개수만 비교하면(size === length)
  // 멤버십이 어긋난 채로 '전체 해제'가 그려진다.
  const visibleSelected = pgList.filter((ws) => selectedIds.has(ws.id)).length;
  const allSelected = pgList.length > 0 && visibleSelected === pgList.length;

  const handleToggle = (ws: PgWorkspace) => {
    if (selectedIds.has(ws.id)) {
      draft.setField(
        'allowedPgWorkspaceIds',
        draft.allowedPgWorkspaceIds.filter((w) => w.id !== ws.id),
      );
    } else {
      draft.setField('allowedPgWorkspaceIds', [
        ...draft.allowedPgWorkspaceIds,
        { id: ws.id, displayName: ws.displayName, logoUpdatedAt: ws.logoUpdatedAt },
      ]);
    }
  };

  const handleToggleAll = () => {
    if (allSelected) {
      draft.setField('allowedPgWorkspaceIds', []);
    } else {
      draft.setField(
        'allowedPgWorkspaceIds',
        pgList.map((ws) => ({
          id: ws.id,
          displayName: ws.displayName,
          logoUpdatedAt: ws.logoUpdatedAt,
        })),
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
            초대할 PG사
          </span>
          <RequiredMark
            state={markerState({
              valid: isPgValid(draft.allowedPgWorkspaceIds),
              attempted: !!showFieldErrors,
            })}
            filledLabel="선택됨"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* 0개에서도 보여야 한다 — 기준선에 표시가 없으면 무엇과 견줄지 알 수 없다. */}
          <span
            data-testid="pg-select-count"
            className="md-label-small text-[var(--md-sys-color-on-surface-variant)]"
          >
            <span className="md-numeric">{`${visibleSelected}/${pgList.length}`}</span> 선택
          </span>
          <Button type="button" variant="text" size="sm" onClick={handleToggleAll}>
            {allSelected ? '전체 해제' : '전체 선택'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {pgList.map((ws) => {
          const selected = selectedIds.has(ws.id);
          return (
            <button
              key={ws.id}
              type="button"
              aria-pressed={selected}
              onClick={() => handleToggle(ws)}
              className={cn(
                chipBase,
                selected
                  ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                  : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)]',
              )}
            >
              {/* 박스는 두 상태 모두에 존재한다 — 선택 시에만 붙이면 칩 폭이 변해
                  커서 아래에서 다음 타깃이 움직인다. 빈 박스가 미선택 상태에서도
                  "여긴 고르는 자리"라고 말한다. 박스 시각은 primitives/Checkbox 를
                  베낀 **의도적 사본이며 자동 동기화되지 않는다** — 그 컴포넌트를
                  넣을 수는 없다(안에 진짜 <input> 이 있어 버튼 안 버튼이 된다).
                  체크 글리프는 2단계 토글(#528)과 같은 lucide Check 를 쓴다.
                  duration 은 명시해야 한다: Tailwind v4 는 --tw-duration 을
                  inherits:false 로 등록해 칩의 100ms 가 여기로 흘러오지 않는다. */}
              <span
                data-testid="pg-chip-check"
                data-state={selected ? 'checked' : 'unchecked'}
                aria-hidden
                className={cn(
                  'grid place-items-center size-4 shrink-0 rounded-md border',
                  'transition-colors duration-[var(--md-sys-motion-duration-short-4)]',
                  selected
                    ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary)]'
                    : 'border-[var(--md-sys-color-on-surface-variant)] bg-transparent group-hover:border-[var(--md-sys-color-on-surface)]',
                )}
              >
                {selected && (
                  // absoluteStrokeWidth 가 있어야 size 10 에서도 stroke 가 1.4px 로
                  // 남는다(없으면 size 에 비례해 얇아진다). lucide 는 currentColor 로
                  // 그리므로 색은 text-* 로 준다.
                  <Check
                    size={10}
                    strokeWidth={1.4}
                    absoluteStrokeWidth
                    aria-hidden
                    className="text-[var(--md-sys-color-on-primary)]"
                  />
                )}
              </span>
              {/* 로고는 장식 — 칩 텍스트가 이미 PG명을 알리므로 a11y 트리에서 숨김 */}
              <span aria-hidden className="inline-flex">
                <WorkspaceAvatar
                  size="sm"
                  name={ws.name}
                  workspaceId={ws.id}
                  logoUpdatedAt={ws.logoUpdatedAt}
                />
              </span>
              {ws.displayName}
            </button>
          );
        })}
      </div>

      {pgError && (
        <FieldError error="PG를 1개 이상 선택해주세요" />
      )}

      <div className="flex justify-between pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
        <Button type="button" variant="outlined" size="md" onClick={onBack}>
          이전
        </Button>
        <Button data-demo-cursor data-coachmark="tutorial-wizard-next-3" type="button" size="md" onClick={() => { setAttempted(true); onNext(); }}>
          다음
        </Button>
      </div>
    </div>
  );
}
