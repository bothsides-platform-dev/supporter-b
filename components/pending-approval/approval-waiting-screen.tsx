'use client';

import Link from 'next/link';
import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PartyPopper } from 'lucide-react';
import { motion, useAnimation } from 'motion/react';
import { Chip } from '@/components/primitives/Chip';
import { useCelebrationConfetti } from '@/lib/hooks/useCelebrationConfetti';
import { checkMyWorkspaceApprovalAction } from '@/lib/server/actions/auth/checkMyWorkspaceApprovalAction';

const ICON_SPAN_STYLE = { display: 'inline-flex' } as const;

function handleLogout() {
  window.location.assign('/logout');
}

export function ApprovalWaitingScreen() {
  const router = useRouter();
  // 컨페티는 공용 축하 모먼트 훅(DESIGN.md §9), 아이콘 셰이크는 이 화면 고유 연출.
  const { canvasRef, fire } = useCelebrationConfetti();
  const iconControls = useAnimation();

  // 아이콘 셰이크 (모션 감소 설정 존중).
  const shake = useCallback(() => {
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      iconControls.start({
        rotate: [-14, 12, -9, 7, -4, 2, 0],
        scale: [1, 1.3, 1.22, 1.15, 1.1, 1.04, 1],
        transition: { duration: 0.65, ease: 'easeOut' },
      });
    }
  }, [iconControls]);

  // 컨페티(훅)와 셰이크를 함께 — 마운트 1회 + "다시 보기" 버튼.
  const celebrate = useCallback(() => {
    fire();
    shake();
  }, [fire, shake]);

  // 마운트 시 셰이크 1회 (컨페티는 훅이 마운트에서 자체 발사).
  useEffect(() => {
    shake();
  }, [shake]);

  useEffect(() => {
    let active = true;
    const id = setInterval(async () => {
      const r = await checkMyWorkspaceApprovalAction();
      if (active && r.approved) {
        clearInterval(id);
        router.push('/home');
      }
    }, 10_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [router]);

  return (
    <>
      {/* 콘페티 캔버스: 뷰포트 전체를 덮되 pointer-events-none 로 클릭은 통과시켜
          푸터·채널톡 FAB·홈 버튼이 그대로 동작한다. 투명 — 솔리드 배경 없음. */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      />
      {/* 콘텐츠: public 레이아웃 안의 일반 흐름. 콘페티 위(z-10). */}
      <div className="relative z-10 flex w-full flex-col items-center gap-4 text-center">
        <button
          type="button"
          aria-label="축하 효과 다시 보기"
          onClick={celebrate}
          className="rounded-[var(--md-sys-shape-small)] p-2 text-[var(--md-sys-color-primary)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-sys-color-primary)]/50"
        >
          <motion.span animate={iconControls} style={ICON_SPAN_STYLE}>
            <PartyPopper className="size-9" strokeWidth={1.5} />
          </motion.span>
        </button>
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-title-large">거의 다 왔어요!</h1>
          <p className="text-body-medium text-on-surface-variant">
            가입을 완료했어요.
            <br />
            지금 입점 심사를 진행하고 있어요.
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
        <Link
          href="/"
          className="inline-flex h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 text-body-medium font-medium text-[var(--md-sys-color-primary)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50"
        >
          홈으로 가기
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 text-body-medium font-medium text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50"
        >
          로그아웃
        </button>
      </div>
    </>
  );
}
