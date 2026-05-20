'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { createWorkspaceAction } from '@/lib/server/actions/workspace/createWorkspaceAction';
import { switchWorkspaceAction } from '@/lib/server/actions/workspace/switchWorkspaceAction';

const ERROR_LABELS: Record<string, string> = {
  INVALID_INPUT: '1자 이상 200자 이하의 이름을 입력해주세요.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
};

// In-app workspace creation (reached from the switcher's "+ 워크스페이스 만들기").
// Creates the workspace (caller becomes admin), then switches the active
// workspace into it via the JWT and lands on /home. bizProfile is left to
// settings/profile — buyer 사업자번호·등급 are optional (PG_RFP_SPEC §3).
export function CreateWorkspaceForm() {
  const router = useRouter();
  const [type, setType] = useState<'buyer' | 'pg'>('buyer');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 200;

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError('');
    const r = await createWorkspaceAction({ type, name: trimmed });
    if (!r.ok) {
      setSubmitting(false);
      setError(ERROR_LABELS[r.error] ?? r.error);
      return;
    }
    // Make the new workspace active in the JWT, then land on /home.
    await switchWorkspaceAction(r.workspaceId);
    router.refresh();
    router.push('/home');
  };

  const labelCls =
    'font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="space-y-6 max-w-[420px]"
    >
      <fieldset className="space-y-2">
        <legend className={labelCls}>워크스페이스 유형</legend>
        <div className="flex gap-4 pt-1">
          {(
            [
              { v: 'buyer', label: '구매사' },
              { v: 'pg', label: 'PG' },
            ] as const
          ).map((opt) => (
            <label
              key={opt.v}
              className="flex items-center gap-2 text-[14px] text-[var(--md-sys-color-on-surface)] cursor-pointer"
            >
              <input
                type="radio"
                name="ws-type"
                value={opt.v}
                checked={type === opt.v}
                onChange={() => setType(opt.v)}
                className="accent-[var(--md-sys-color-primary)]"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="ws-name" className={labelCls}>
          워크스페이스 이름
        </label>
        <input
          id="ws-name"
          type="text"
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-1 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]"
        >
          {error}
        </p>
      )}

      <Button type="submit" disabled={!valid || submitting}>
        {submitting ? '생성 중…' : '워크스페이스 만들기'}
      </Button>
    </form>
  );
}
