'use client';

import { useCallback, useEffect, useRef } from 'react';
import { PartyPopper } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Chip } from '@/components/primitives/Chip';

export function ApprovalWaitingScreen() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fireRef = useRef<ReturnType<typeof confetti.create> | null>(null);

  const fire = useCallback(() => {
    const run = fireRef.current;
    if (!run) return;
    const primary =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--md-sys-color-primary')
        .trim() || '#0061A4';
    run({
      particleCount: 30,
      spread: 26,
      startVelocity: 45,
      gravity: 1,
      scalar: 1,
      origin: { x: 0.5, y: 0.42 },
      colors: [primary],
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    fireRef.current = confetti.create(canvas, {
      resize: true,
      useWorker: false,
    });
    fire();
    return () => {
      fireRef.current?.reset();
      fireRef.current = null;
    };
  }, [fire]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ pointerEvents: 'none' }}
      />
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-3 text-center">
        <button
          type="button"
          aria-label="축하 효과 다시 보기"
          onClick={fire}
          className="rounded-[var(--md-sys-shape-small)] p-2 text-[var(--md-sys-color-primary)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-sys-color-primary)]/50"
        >
          <PartyPopper className="size-9" strokeWidth={1.5} />
        </button>
        <h1 className="text-title-large">거의 다 왔어요!</h1>
        <p className="text-body-medium text-on-surface-variant">
          가입이 완료됐어요.
          <br />
          지금 입점 심사를 진행하고 있어요.
        </p>
        <Chip color="tertiary" label="✓ 심사는 최대 영업일 2일 이내 완료돼요" />
        <p className="text-body-small text-on-surface-variant">
          승인되면 이메일로 안내드립니다.
        </p>
        <p className="text-body-small text-on-surface-variant">
          궁금한 점은 우측 하단 채널톡으로 문의해 주세요.
        </p>
      </div>
    </div>
  );
}
