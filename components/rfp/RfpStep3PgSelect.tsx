'use client';

import { useState } from 'react';
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
  recommendedPgIds?: string[];
  industryName?: string;
  onBack?: () => void;
  onNext?: () => void;
  showFieldErrors?: boolean;
};

// 칩은 raw <button> 이라 상호작용 값을 직접 실어야 한다 — Tailwind v4 Preflight 가
// button { cursor: default } 를 깔아두므로 빠지면 커서가 화살표로 남고 hover 가
// 끊기고 포커스 표시가 사라진다(DESIGN.md §Sidebar 푸터 행과 같은 규칙).
const chipBase = cn(
  'inline-flex items-center gap-1.5 h-9 pl-2 pr-3 shrink-0',
  'rounded-[var(--md-sys-shape-small)] border text-[13px]',
  'cursor-pointer transition-colors duration-[var(--md-sys-motion-duration-short-4)]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50',
);

export function RfpStep3PgSelect({ pgList, recommendedPgIds = [], industryName, onBack, onNext, showFieldErrors }: Props) {
  const draft = useRfpDraftStore();
  const [attempted, setAttempted] = useState(false);

  const selectedIds = new Set(draft.allowedPgWorkspaceIds.map((w) => w.id));
  const recommendedSet = new Set(recommendedPgIds);
  const recommended = pgList.filter((ws) => recommendedSet.has(ws.id));
  const others = pgList.filter((ws) => !recommendedSet.has(ws.id));
  const orderedPgs = industryName ? [...recommended, ...others] : pgList;
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
    <div className="space-y-4" data-coachmark="tutorial-pg-choices">
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
          {/* 고를 게 없으면 라벨은 '전체 선택'인데 동작은 초안 비우기다 — 막는다. */}
          <Button
            type="button"
            variant="text"
            size="sm"
            disabled={pgList.length === 0}
            onClick={handleToggleAll}
          >
            {allSelected ? '전체 해제' : '전체 선택'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {orderedPgs.map((ws, index) => {
          const selected = selectedIds.has(ws.id);
          return (
            <div key={ws.id} className="contents">
              {industryName && index === 0 && <p className="w-full text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">{industryName} 업종에 맞는 PG사</p>}
              {industryName && index === recommended.length && recommended.length > 0 && others.length > 0 && <p className="w-full pt-2 text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">다른 PG사</p>}
              {industryName && index === 0 && recommended.length === 0 && <p className="w-full text-[13px] text-[var(--md-sys-color-on-surface-variant)]">{industryName} 업종에 등록된 PG사가 없어요. 아래에서 직접 선택해주세요.</p>}
            <button
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
            </div>
          );
        })}
      </div>

      {pgError && (
        <FieldError error="PG를 1개 이상 선택해주세요" />
      )}

      {onBack && onNext && (
        <div className="flex justify-between pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
          <Button type="button" variant="outlined" size="md" onClick={onBack}>
            이전
          </Button>
          <Button data-demo-cursor data-coachmark="tutorial-wizard-next-3" type="button" size="md" onClick={() => { setAttempted(true); onNext(); }}>
            다음
          </Button>
        </div>
      )}
    </div>
  );
}
