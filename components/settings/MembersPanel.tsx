'use client';

import { useCallback, useState, useTransition } from 'react';
import { josa } from 'es-hangul';
import { Label } from '@/components/primitives/Label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { inviteWorkspaceMemberAction } from '@/lib/server/actions/workspace/inviteWorkspaceMemberAction';
import { removeWorkspaceMemberAction } from '@/lib/server/actions/workspace/removeWorkspaceMemberAction';
import { changeWorkspaceMemberRoleAction } from '@/lib/server/actions/workspace/changeWorkspaceMemberRoleAction';
import { cancelWorkspaceInviteAction } from '@/lib/server/actions/workspace/cancelWorkspaceInviteAction';
import { resendWorkspaceInviteAction } from '@/lib/server/actions/workspace/resendWorkspaceInviteAction';
import type { Role, User } from '@/lib/types/user';
import { mutationErrorMessage, roleLabel } from './members-panel-utils';
import { MemberRow } from './MemberRow';
import { Divider } from '@/components/primitives/Divider';
import { PendingInviteRow, type PendingInvite } from './PendingInviteRow';
import { InviteMemberForm } from './InviteMemberForm';
import { Button } from '@/components/primitives/Button';
import { SettingsPage } from './SettingsPage';

type ConfirmState =
  | { kind: 'remove'; member: User }
  | { kind: 'cancelInvite'; email: string }
  | null;

type InviteResult = { ok: true } | { ok: false; error: string };

type Props = {
  workspaceId: string;
  workspaceName: string;
  initialMembers: User[];
  userRole: Role;
  initialPendingInvites: PendingInvite[];
  /** 현재 로그인한 사용자 id — 자기 자신에 대한 강퇴/역할변경을 막는다. */
  currentUserId: string;
};

export function MembersPanel({
  workspaceId,
  workspaceName,
  initialMembers,
  userRole,
  initialPendingInvites,
  currentUserId,
}: Props) {
  const [members, setMembers] = useState<User[]>(initialMembers);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>(initialPendingInvites);
  const [isPending, startTransition] = useTransition();
  const [isMutating, startMutate] = useTransition();
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [mutationFailure, setMutationFailure] = useState<{ retry: () => void } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const isAdmin = userRole === 'admin';

  // ── invite form ──────────────────────────────────────────────────────────
  const handleInvite = useCallback(
    ({ email, role }: { email: string; role: Role }) =>
      new Promise<InviteResult>((resolve) => {
        startTransition(async () => {
          try {
            const result = await inviteWorkspaceMemberAction({ workspaceId, email, role });
            if (!result.ok) {
              resolve({ ok: false, error: result.error });
              return;
            }
            setPendingInvites((prev) => [
              ...prev,
              { email, createdAt: null, role },
            ]);
            toast('초대 메일을 보냈어요.');
            resolve({ ok: true });
          } catch {
            resolve({ ok: false, error: 'UNKNOWN' });
          }
        });
      }),
    [workspaceId],
  );

  const runMutation = useCallback(function run(
    request: () => Promise<{ ok: boolean; error?: string }>,
    onSuccess: () => void,
  ): void {
    setMutationFailure(null);
    startMutate(async () => {
      try {
        const result = await request();
        if (!result.ok) {
          toast(mutationErrorMessage(result.error ?? 'UNKNOWN'), { type: 'error' });
          return;
        }
        onSuccess();
      } catch {
        setConfirm(null);
        setMutationFailure({ retry: () => run(request, onSuccess) });
      }
    });
  }, []);

  const handleRemove = useCallback((m: User) => {
    runMutation(() => removeWorkspaceMemberAction({ workspaceId, userId: m.id }), () => {
      setMembers(prev => prev.filter(x => x.id !== m.id));
      setConfirm(null);
      toast(`${m.name}님을 내보냈어요.`);
    });
  }, [workspaceId, runMutation]);

  const handleRoleChange = useCallback((m: User, role: Role) => {
    if (role === m.role) return;
    runMutation(() => changeWorkspaceMemberRoleAction({ workspaceId, userId: m.id, role }), () => {
      setMembers(prev => prev.map(x => x.id === m.id ? { ...x, role } : x));
      toast(`${m.name}님의 권한을 ${josa(roleLabel[role], '으로/로')} 변경했어요.`);
    });
  }, [workspaceId, runMutation]);

  const handleCancelInvite = useCallback((email: string) => {
    runMutation(() => cancelWorkspaceInviteAction({ workspaceId, email }), () => {
      setPendingInvites(prev => prev.filter(p => p.email !== email));
      setConfirm(null);
      toast('초대를 취소했어요.');
    });
  }, [workspaceId, runMutation]);

  const handleResend = useCallback((email: string) => {
    runMutation(() => resendWorkspaceInviteAction({ workspaceId, email }), () => {
      toast('초대 메일을 다시 보냈어요.');
    });
  }, [workspaceId, runMutation]);

  // ── row callbacks (stable refs so memoized rows skip re-render) ────────────
  const handleRemoveClick = useCallback((m: User) => {
    setConfirm({ kind: 'remove', member: m });
  }, []);

  const handleCancelInviteClick = useCallback((email: string) => {
    setConfirm({ kind: 'cancelInvite', email });
  }, []);

  // ── confirm dialog ────────────────────────────────────────────────────────
  const confirmTitle =
    confirm?.kind === 'remove'
      ? `${confirm.member.name}님을 내보낼까요?`
      : confirm?.kind === 'cancelInvite'
        ? '초대를 취소할까요?'
        : '';

  const confirmDescription =
    confirm?.kind === 'cancelInvite' ? confirm.email : undefined;

  const handleConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === 'remove') handleRemove(confirm.member);
    else if (confirm.kind === 'cancelInvite') handleCancelInvite(confirm.email);
  };

  return (
    <SettingsPage
      title="멤버 관리"
      action={
        isAdmin && (
          <Button
            type="button"
            variant="outlined"
            aria-expanded={inviteOpen}
            aria-controls="member-invite-form"
            disabled={isPending}
            onClick={() => setInviteOpen((open) => !open)}
          >
            멤버 초대
          </Button>
        )
      }
    >
      <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)] [overflow-wrap:anywhere]">
        {workspaceName} 워크스페이스의 멤버 <span className="md-numeric">{members.length}명</span>
        {pendingInvites.length > 0 && <>, 초대 대기 <span className="md-numeric">{pendingInvites.length}건</span></>}
      </p>

      {mutationFailure && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[6px] border border-[var(--md-sys-color-error)] p-3 text-[14px] text-[var(--md-sys-color-error)]">
        <p>요청 결과를 확인하지 못했어요. 기존 목록을 유지했어요. 다시 시도하거나 새로고침해 상태를 확인해요.</p>
        <Button type="button" variant="outlined" disabled={isMutating} onClick={mutationFailure.retry}>다시 시도</Button>
      </div>}

      {isAdmin && inviteOpen && (
        <div id="member-invite-form">
          <InviteMemberForm isPending={isPending} onInvite={handleInvite} />
        </div>
      )}

      {/* ── active members ── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <Label size="md" muted={false}>활성 멤버</Label>
          <span className="md-numeric text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {String(members.length).padStart(2, '0')}
          </span>
          <Divider />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              isSelf={m.id === currentUserId}
              isAdmin={isAdmin}
              isMutating={isMutating}
              onRoleChange={handleRoleChange}
              onRemoveClick={handleRemoveClick}
            />
          ))}
        </div>
      </section>

      {/* ── pending invitations ── */}
      {pendingInvites.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <Label size="md" muted={false}>초대 대기</Label>
            <span className="md-numeric text-xs text-[var(--md-sys-color-warning)]">
              {String(pendingInvites.length).padStart(2, '0')}
            </span>
            <Divider />
          </div>
          <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
            {pendingInvites.map((p) => (
              <PendingInviteRow
                key={p.email}
                invite={p}
                isAdmin={isAdmin}
                isMutating={isMutating}
                onResend={handleResend}
                onCancelClick={handleCancelInviteClick}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── confirm dialog (shared for remove + cancel invite) ── */}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirm?.kind === 'remove' ? '내보내기' : '초대 취소'}
        variant="danger"
        onConfirm={handleConfirm}
        loading={isMutating}
      />
    </SettingsPage>
  );
}
