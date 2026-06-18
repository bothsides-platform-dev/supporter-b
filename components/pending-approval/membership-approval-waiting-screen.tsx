'use client';

import { useCallback, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { motion, useAnimation } from 'motion/react';
import { Chip } from '@/components/primitives/Chip';
import { checkMyMembershipApprovalAction } from '@/lib/server/actions/auth/checkMyMembershipApprovalAction';

const ICON_SPAN_STYLE = { display: 'inline-flex' } as const;

function handleLogout() {
  window.location.assign('/logout');
}

export function MembershipApprovalWaitingScreen() {
  const iconControls = useAnimation();

  const shake = useCallback(() => {
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      iconControls.start({
        rotate: [-14, 12, -9, 7, -4, 2, 0],
        scale: [1, 1.3, 1.22, 1.15, 1.1, 1.04, 1],
        transition: { duration: 0.65, ease: 'easeOut' },
      });
    }
  }, [iconControls]);

  useEffect(() => {
    shake();
  }, [shake]);

  useEffect(() => {
    let active = true;
    const id = setInterval(async () => {
      const r = await checkMyMembershipApprovalAction();
      if (active && r.status === 'approved') {
        clearInterval(id);
        window.location.assign('/home');
      }
    }, 10_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="relative z-10 flex w-full flex-col items-center gap-4 text-center">
      <button
        type="button"
        aria-label="아이콘 흔들기"
        onClick={shake}
        className="rounded-[var(--md-sys-shape-small)] p-2 text-[var(--md-sys-color-primary)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-sys-color-primary)]/50"
      >
        <motion.span animate={iconControls} style={ICON_SPAN_STYLE}>
          <Clock className="size-9" strokeWidth={1.5} />
        </motion.span>
      </button>
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-title-large">담당자 계정 심사 중이에요</h1>
        <p className="text-body-medium text-on-surface-variant">
          합류 신청을 완료했어요.
          <br />
          운영팀이 계정을 검토하고 있어요.
        </p>
      </div>
      <Chip color="tertiary" label="✓ 심사는 영업일 기준 2일 이내로 완료해요" />
      <div className="flex flex-col items-center gap-1">
        <p className="text-body-small text-on-surface-variant">
          승인되면 이메일로 안내드립니다.
        </p>
        <p className="text-body-small text-on-surface-variant">
          궁금한 점은 우측 하단 채널톡으로 문의해요.
        </p>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="inline-flex h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 text-body-medium font-medium text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50"
      >
        로그아웃
      </button>
    </div>
  );
}
