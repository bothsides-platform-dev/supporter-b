'use client';

import { useState } from 'react';
import { Avatar, type AvatarColor } from '@/components/primitives/Avatar';
import { PresenceDot } from '@/components/presence/PresenceDot';
import { useUserPresence } from '@/components/presence/WorkspacePresenceProvider';
import { ComposeIcon } from '@/components/icons';
import { MessageComposeSheet } from '@/components/messages/MessageComposeSheet';
import type { Counterparty } from '@/components/messages/types';
import { getUserProfileAction } from '@/lib/server/actions/user/getUserProfileAction';
import type { UserProfileForViewer } from '@/lib/server/user-profile-loader';
import { ProfilePopover } from './ProfilePopover';

type Size = 'sm' | 'md' | 'lg';

type Props = {
  /** 카드가 설명할 사람. */
  userId: string;
  /** 즉시 렌더용 힌트 — 액션이 응답하기 전 깜빡임을 막는다(화면에 이미 보이던 값). */
  name: string;
  avatarUpdatedAt?: string | null;
  /** 트리거 아바타 크기/색 — 박히는 자리에 맞춘다. */
  size?: Size;
  color?: AvatarColor;
};

const MESSAGE_LABEL = '메시지 보내기';

const TRIGGER_CLASS =
  'inline-flex rounded-[var(--md-sys-shape-extra-small)] outline-none transition-shadow hover:ring-2 hover:ring-[var(--md-sys-color-outline-variant)] focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50';

const MSG_BTN_CLASS =
  'mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--md-sys-color-on-surface)] outline-none transition-colors hover:bg-[var(--md-sys-color-surface-container-high)] focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50';

/**
 * 사람(계정) 신원 카드 — 아바타 클릭 시 이름·사진·온라인 상태·이메일을 팝오버로 띄운다.
 * 데이터는 **열 때** getUserProfileAction(userId)로 서버에서 가져온다(이메일 비열거는 서버 ACL
 * 책임 — UserProfileCard 는 받은 것만 그린다). 메시지 버튼은 상대(counterparty)일 때만 — 워크스페이스
 * 단위 대화이므로 같은 팀 동료/본인에겐 보낼 대상이 없다. 사람 아바타가 보이는 모든 화면의 단일 진입점.
 */
export function UserProfileCard({ userId, name, avatarUpdatedAt, size = 'sm', color = 'surface' }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [profile, setProfile] = useState<UserProfileForViewer | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // presenceWorkspaceId 는 로드 후에야 채워진다 — 그 전엔 undefined 라 no-op(false).
  const online = useUserPresence(profile?.presenceWorkspaceId, userId);

  function handleOpenChange(open: boolean) {
    if (!open) return;
    // 성공('loaded')은 캐시하고, 진행 중('loading')은 중복 차단. 단 'error'(일시 실패)면 재오픈 시
    // 다시 시도한다 — 그러지 않으면 네트워크 깜빡임 한 번에 카드가 영구히 'brick' 된다.
    if (status === 'loading' || status === 'loaded') return;
    setStatus('loading');
    getUserProfileAction(userId)
      .then((res) => {
        if (res.ok) {
          setProfile(res.profile);
          setStatus('loaded');
        } else {
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  }

  const counterparty: Counterparty | null =
    profile?.relationship === 'counterparty' && profile.workspace
      ? {
          name: profile.workspace.name,
          type: profile.workspace.type,
          workspaceId: profile.workspace.id,
          logoUpdatedAt: profile.workspace.logoUpdatedAt,
        }
      : null;

  return (
    <>
      <ProfilePopover
        triggerAriaLabel={`${name} 프로필`}
        triggerClassName={TRIGGER_CLASS}
        onOpenChange={handleOpenChange}
        trigger={
          <Avatar name={name} userId={userId} avatarUpdatedAt={avatarUpdatedAt} size={size} color={color} />
        }
      >
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <Avatar
              name={profile?.name ?? name}
              userId={userId}
              avatarUpdatedAt={profile?.avatarUpdatedAt ?? avatarUpdatedAt}
              size="lg"
              color={color}
            />
            <PresenceDot activity={online ? 'active' : 'offline'} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
              {profile?.name ?? name}
            </p>
            {(status === 'idle' || status === 'loading') && (
              <p className="truncate text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                LOADING…
              </p>
            )}
            {status === 'loaded' && profile && (
              <p className="truncate text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                {profile.email}
              </p>
            )}
            {status === 'error' && (
              <p className="truncate text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                정보를 볼 수 없어요
              </p>
            )}
          </div>
        </div>

        {counterparty && (
          <button type="button" onClick={() => setSheetOpen(true)} className={MSG_BTN_CLASS}>
            <ComposeIcon size={14} />
            {MESSAGE_LABEL}
          </button>
        )}
      </ProfilePopover>

      {counterparty && (
        <MessageComposeSheet open={sheetOpen} onOpenChange={setSheetOpen} counterparty={counterparty} />
      )}
    </>
  );
}
