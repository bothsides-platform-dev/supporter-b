'use client';

import { useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
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

export function RfpStep3PgSelect({ pgList, onBack, onNext, showFieldErrors }: Props) {
  const draft = useRfpDraftStore();
  const [attempted, setAttempted] = useState(false);

  const selectedIds = new Set(draft.allowedPgWorkspaceIds.map((w) => w.id));
  const pgError = (attempted || !!showFieldErrors) && draft.allowedPgWorkspaceIds.length === 0;
  const allSelected = pgList.length > 0 && selectedIds.size === pgList.length;

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            초대할 PG사
          </span>
          <RequiredMark
            state={markerState({
              valid: isPgValid(draft.allowedPgWorkspaceIds),
              attempted: !!showFieldErrors,
            })}
          />
        </div>
        <button
          type="button"
          onClick={handleToggleAll}
          className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--md-sys-color-primary)]"
        >
          {allSelected ? '전체 해제' : '전체 선택'}
        </button>
      </div>

      <div className="flex flex-wrap gap-[6px]">
        {pgList.map((ws) => {
          const selected = selectedIds.has(ws.id);
          return (
            <button
              key={ws.id}
              type="button"
              onClick={() => handleToggle(ws)}
              className={
                selected
                  ? 'inline-flex items-center gap-1.5 py-[5px] pl-[5px] pr-3 rounded-[6px] text-[13px] bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] border border-[var(--md-sys-color-primary)]'
                  : 'inline-flex items-center gap-1.5 py-[5px] pl-[5px] pr-3 rounded-[6px] text-[13px] bg-transparent text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)]'
              }
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
          );
        })}
      </div>

      {draft.allowedPgWorkspaceIds.length > 0 && (
        <p className="font-mono text-[10px] tracking-[0.08em] text-[var(--md-sys-color-primary)]">
          {draft.allowedPgWorkspaceIds.length}개 선택됨
        </p>
      )}
      {pgError && (
        <FieldError error="PG를 1개 이상 선택해주세요" />
      )}

      <div className="flex justify-between pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
        <Button type="button" variant="outlined" size="md" onClick={onBack}>
          이전
        </Button>
        <Button type="button" size="md" onClick={() => { setAttempted(true); onNext(); }}>
          다음
        </Button>
      </div>
    </div>
  );
}
