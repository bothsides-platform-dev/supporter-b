'use client';

import { useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { BuyerWorkspaceForm } from '@/components/auth/BuyerWorkspaceForm';
import {
  createWorkspaceAction,
  type CreateWorkspaceActionInput,
} from '@/lib/server/actions/workspace/createWorkspaceAction';
import { switchWorkspaceAction } from '@/lib/server/actions/workspace/switchWorkspaceAction';

const ERROR_LABELS: Record<string, string> = {
  INVALID_INPUT: '1자 이상 200자 이하의 이름을 입력해주세요.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
};

// In-app workspace creation (reached from the switcher's "+ 워크스페이스 만들기").
// Buyer reuses the signup BuyerWorkspaceForm (name + optional 사업자번호/등급);
// PG just needs a name. On success the new ws is created (caller becomes admin),
// switched into via the JWT, and we land on /home.
export function CreateWorkspaceForm() {
  const [type, setType] = useState<'buyer' | 'pg'>('buyer');
  const [name, setName] = useState(''); // pg only
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function create(input: CreateWorkspaceActionInput) {
    setSubmitting(true);
    setError('');
    const r = await createWorkspaceAction(input);
    if (!r.ok) {
      setSubmitting(false);
      setError(ERROR_LABELS[r.error] ?? r.error);
      return;
    }
    const sr = await switchWorkspaceAction(r.workspaceId);
    // Hard nav to the host-correct landing (a newly created PG ws may live on the
    // partner subdomain). Soft router.push would leave stale shell chrome.
    window.location.assign(sr.ok ? sr.redirectTo : '/home');
  }

  const pgName = name.trim();
  const pgValid = pgName.length >= 1 && pgName.length <= 200;

  const labelCls =
    'md-label-small text-[var(--md-sys-color-on-surface-variant)]';

  return (
    <div className="space-y-6 max-w-[420px]">
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
                onChange={() => {
                  setType(opt.v);
                  setError('');
                }}
                className="accent-[var(--md-sys-color-primary)]"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {type === 'buyer' ? (
        <BuyerWorkspaceForm
          submitting={submitting}
          error={error}
          onSubmit={async ({ wsName, bizProfile }) => {
            await create({ type: 'buyer', name: wsName, bizProfile });
          }}
        />
      ) : (
        <>
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
              className="w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-1 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="md-label-small text-[var(--md-sys-color-error)]"
            >
              {error}
            </p>
          )}

          <Button
            type="button"
            disabled={!pgValid || submitting}
            onClick={() => create({ type: 'pg', name: pgName })}
          >
            {submitting ? '생성 중…' : '워크스페이스 만들기'}
          </Button>
        </>
      )}
    </div>
  );
}
