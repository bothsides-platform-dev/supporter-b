'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { PartyPopper } from 'lucide-react';
import confetti from 'canvas-confetti';
import { motion, useAnimation } from 'motion/react';
import { Chip } from '@/components/primitives/Chip';

const ICON_SPAN_STYLE = { display: 'inline-flex' } as const;

export function ApprovalWaitingScreen() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fireRef = useRef<ReturnType<typeof confetti.create> | null>(null);
  const iconControls = useAnimation();

  const fire = useCallback(() => {
    const run = fireRef.current;
    if (!run) return;
    const primary =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--md-sys-color-primary')
        .trim() || '#0061A4';

    const shared = { colors: [primary], scalar: 1, ticks: 250 };

    // 좌측 끝에서 안쪽 위로
    run({ ...shared, particleCount: 80, angle: 60, spread: 60, startVelocity: 65, origin: { x: 0, y: 0.65 } });
    // 우측 끝에서 안쪽 위로
    run({ ...shared, particleCount: 80, angle: 120, spread: 60, startVelocity: 65, origin: { x: 1, y: 0.65 } });
    // 중앙 상단에서 180° 전방위 비
    run({ ...shared, particleCount: 120, spread: 180, startVelocity: 40, gravity: 0.6, origin: { x: 0.5, y: 0 } });

    // 아이콘 셰이크 (모션 감소 설정 존중)
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      iconControls.start({
        rotate: [-14, 12, -9, 7, -4, 2, 0],
        scale: [1, 1.3, 1.22, 1.15, 1.1, 1.04, 1],
        transition: { duration: 0.65, ease: 'easeOut' },
      });
    }
  }, [iconControls]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    fireRef.current = confetti.create(canvas, {
      resize: true,
      useWorker: false,
      disableForReducedMotion: true,
    });
    fire();
    return () => {
      fireRef.current?.reset();
      fireRef.current = null;
    };
  }, [fire]);

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
          onClick={fire}
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
      </div>
    </>
  );
}
