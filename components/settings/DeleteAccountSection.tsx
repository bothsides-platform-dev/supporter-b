'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/primitives/Button';
import { Field } from '@/components/primitives/Field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { getDeleteAccountStatus } from '@/lib/server/actions/auth/getDeleteAccountStatus';
import { deleteAccountAction } from '@/lib/server/actions/auth/deleteAccountAction';
import type {
  BlockingWorkspace,
  WorkspaceStub,
} from '@/lib/auth/account-deletion';

type DialogState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'blocked'; blockingWorkspaces: BlockingWorkspace[] }
  | { phase: 'ready'; soloWorkspaces: WorkspaceStub[] };

export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>({ phase: 'idle' });
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOpen = async () => {
    setOpen(true);
    setDialogState({ phase: 'loading' });
    setPassword('');
    setPasswordError('');

    const status = await getDeleteAccountStatus();
    if (!status.ok) {
      setDialogState({ phase: 'error', message: '탈퇴 정보를 불러오지 못했어요. 다시 시도해 주세요.' });
      return;
    }
    if (status.blockingWorkspaces.length > 0) {
      setDialogState({ phase: 'blocked', blockingWorkspaces: status.blockingWorkspaces });
    } else {
      setDialogState({ phase: 'ready', soloWorkspaces: status.soloWorkspaces });
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setOpen(false);
    setDialogState({ phase: 'idle' });
    setPassword('');
    setPasswordError('');
  };

  const handleSubmit = async () => {
    // 버튼은 disabled 로 막히지만 Enter 는 버튼을 거치지 않는다 — 빈 비밀번호
    // 제출은 여기서 한 번 더 막아야 한다(탈퇴는 비가역).
    if (submitting || !password) return;
    setPasswordError('');
    setSubmitting(true);

    const result = await deleteAccountAction({ password });
    setSubmitting(false);

    if (!result.ok) {
      if (result.error === 'INVALID_PASSWORD') {
        setPasswordError('비밀번호가 올바르지 않아요.');
      } else if (result.error === 'LAST_ADMIN') {
        setDialogState({
          phase: 'blocked',
          blockingWorkspaces: result.blockingWorkspaces,
        });
      } else {
        // UNAUTHENTICATED or unknown error
        setDialogState({ phase: 'error', message: '오류가 발생했어요. 다시 시도해 주세요.' });
      }
      return;
    }

    await signOut({ callbackUrl: '/login' });
  };

  return (
    <section className="border border-[var(--md-sys-color-error)]/20 rounded-[var(--md-sys-shape-small)] p-4 space-y-3">
      <div>
        <p className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
          계정 탈퇴
        </p>
        <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
          탈퇴하면 모든 워크스페이스 멤버십이 삭제되며 복구할 수 없어요.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        color="error"
        variant="outlined"
        onClick={handleOpen}
      >
        탈퇴하기
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent showCloseButton={false} className="sm:max-w-[440px]">
          {dialogState.phase === 'loading' && (
            <>
              <DialogHeader>
                <DialogTitle>계정 탈퇴</DialogTitle>
              </DialogHeader>
              <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
                불러오는 중이에요…
              </p>
            </>
          )}

          {dialogState.phase === 'error' && (
            <>
              <DialogHeader>
                <DialogTitle>오류</DialogTitle>
              </DialogHeader>
              <p className="text-[13px] text-[var(--md-sys-color-error)]">
                {dialogState.message}
              </p>
              <DialogFooter>
                <Button variant="outlined" size="sm" onClick={handleClose}>
                  닫기
                </Button>
              </DialogFooter>
            </>
          )}

          {dialogState.phase === 'blocked' && (
            <>
              <DialogHeader>
                <DialogTitle>아직 탈퇴할 수 없어요</DialogTitle>
                <DialogDescription>
                  아래 워크스페이스는 회원님이 유일한 관리자예요.
                </DialogDescription>
              </DialogHeader>
              <ul className="space-y-3 text-[13px]">
                {dialogState.blockingWorkspaces.map((ws) => (
                  <li key={ws.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[var(--md-sys-color-on-surface)]">{ws.name}</span>
                      {/* 남은 멤버가 전부 승인 대기·거절·시스템 계정이면 '권한을 넘기라'는
                          안내가 실행 불가능해진다 — 그 경우 다음 행동을 따로 알려준다. */}
                      <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                        {ws.hasDelegatableMember
                          ? '다른 멤버에게 관리자 권한을 넘겨주세요.'
                          : '권한을 넘길 수 있는 멤버가 없어요. 팀원을 초대하거나 대기 중인 멤버를 승인해 주세요.'}
                      </p>
                    </div>
                    <Link
                      href="/settings/members"
                      className="text-[var(--md-sys-color-primary)] text-[12px] shrink-0 hover:underline"
                      onClick={handleClose}
                    >
                      멤버 설정 →
                    </Link>
                  </li>
                ))}
              </ul>
              <DialogFooter>
                <Button variant="outlined" size="sm" onClick={handleClose}>
                  닫기
                </Button>
              </DialogFooter>
            </>
          )}

          {dialogState.phase === 'ready' && (
            <>
              <DialogHeader>
                <DialogTitle>정말 탈퇴하시겠어요?</DialogTitle>
                <DialogDescription>
                  탈퇴 후에는 복구가 불가능해요.
                </DialogDescription>
              </DialogHeader>

              {dialogState.soloWorkspaces.length > 0 && (
                <div className="text-[12px] text-[var(--md-sys-color-on-surface-variant)] space-y-1">
                  <p>아래 워크스페이스는 멤버가 없어 함께 삭제돼요:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {dialogState.soloWorkspaces.map((ws) => (
                      <li key={ws.id}>{ws.name}</li>
                    ))}
                  </ul>
                </div>
              )}

              <Field label="비밀번호" htmlFor="delete-account-password">
                <input
                  id="delete-account-password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  className="w-full border-b border-[var(--md-sys-color-outline-variant)] bg-transparent py-1.5 text-[13px] text-[var(--md-sys-color-on-surface)] outline-none focus:border-[var(--md-sys-color-primary)]"
                  disabled={submitting}
                  autoComplete="current-password"
                />
              </Field>

              {passwordError && (
                <p
                  role="alert"
                  className="text-[12px] text-[var(--md-sys-color-error)]"
                >
                  {passwordError}
                </p>
              )}

              <DialogFooter>
                <Button
                  variant="outlined"
                  size="sm"
                  onClick={handleClose}
                  disabled={submitting}
                >
                  닫기
                </Button>
                <Button
                  size="sm"
                  color="error"
                  onClick={handleSubmit}
                  disabled={!password || submitting}
                >
                  {submitting ? '처리 중…' : '탈퇴 확인'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
