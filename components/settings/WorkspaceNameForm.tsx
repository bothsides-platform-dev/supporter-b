'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Field } from '@/components/primitives/Field';
import { underlineInputClass } from '@/components/forms/inputs';
import { renameWorkspaceAction } from '@/lib/server/actions/workspace/renameWorkspaceAction';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { errorLabel } from '@/lib/utils/error-label';

type Props = {
  currentName: string;
  canEdit: boolean;
};

const ERROR_LABELS: Record<string, string> = {
  INVALID_INPUT: '1자 이상 200자 이하로 입력해요.',
  FORBIDDEN: '권한이 없어요.',
  NOT_FOUND: '워크스페이스를 찾지 못했어요.',
};

export function WorkspaceNameForm({ currentName, canEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentName);
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const trimmed = name.trim();
  const dirty = trimmed !== currentName && trimmed.length >= 1 && trimmed.length <= 200;

  const handleStart = () => {
    setName(currentName);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setName(currentName);
  };

  const handleSubmit = async () => {
    if (!dirty || submitting) return;
    setSubmitting(true);
    const r = await renameWorkspaceAction({ name: trimmed });
    setSubmitting(false);
    if (!r.ok) {
      // 미매핑 코드를 그대로 띄우면 사용자에게 내부 enum 이 노출된다
      // (WorkspaceBizNoForm 과 같은 폴백 정책 — 같은 화면에서 한쪽만 원문이면 안 된다).
      toast(errorLabel(ERROR_LABELS, r.error, '저장하지 못했어요. 잠시 후 다시 시도해 주세요.'), {
        type: 'error',
      });
      return;
    }
    toast('이름을 변경했어요.');
    setEditing(false);
    startTransition(() => router.refresh());
  };

  if (!editing) {
    return (
      <div className="py-2 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
          이름
        </span>
        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
          <span className="text-[13px] text-[var(--md-sys-color-on-surface)] md-numeric break-all sm:break-keep">
            {currentName}
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={handleStart}
              className="md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors shrink-0"
            >
              수정
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="py-3 space-y-3">
      <Field label="이름" htmlFor="workspace-name-input">
        <input
          ref={inputRef}
          id="workspace-name-input"
          type="text"
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              handleCancel();
            }
          }}
          className={cn(underlineInputClass, 'sm:max-w-[360px]')}
        />
      </Field>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleCancel}
          className="md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          취소
        </button>
        <Button type="button" disabled={!dirty || submitting} onClick={handleSubmit}>
          {submitting ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  );
}
