'use client';

// 견적 선정 직후 1회만 뜨는 전체 화면 축하 결과 — 히어로(선정 PG·완료) + 혜택 요약
// (ImprovementSummary 재사용) + 컨페티(approval-waiting-screen 패턴 차용). 주 CTA는
// getOrCreateConversationAction으로 선정 PG와의 빈 대화를 보장하고 메시지로 딥링크.
// Linear 하드룰의 "축하 모먼트" 승인 예외(DESIGN.md §9) — 이 화면 한정.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { motion } from 'motion/react';
import { Button } from '@/components/primitives/Button';
import { ImprovementSummary, type CurrentConditions } from './ImprovementSummary';
import { getOrCreateConversationAction } from '@/lib/server/actions/chat/getOrCreateConversationAction';
import type { Bid, MerchantTier } from '@/lib/types/bid';

export function AwardResult({
  pgName,
  pgWsId,
  bid,
  current,
  tier = 'general',
}: {
  pgName: string;
  pgWsId: string;
  bid: Bid;
  current: CurrentConditions;
  tier?: MerchantTier;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fireRef = useRef<ReturnType<typeof confetti.create> | null>(null);
  const [starting, setStarting] = useState(false);

  const fire = useCallback(() => {
    const run = fireRef.current;
    if (!run) return;
    const primary =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--md-sys-color-primary')
        .trim() || '#0061A4';
    const shared = { colors: [primary], scalar: 1, ticks: 250 };
    run({ ...shared, particleCount: 80, angle: 60, spread: 60, startVelocity: 65, origin: { x: 0, y: 0.65 } });
    run({ ...shared, particleCount: 80, angle: 120, spread: 60, startVelocity: 65, origin: { x: 1, y: 0.65 } });
    run({ ...shared, particleCount: 120, spread: 180, startVelocity: 40, gravity: 0.6, origin: { x: 0.5, y: 0 } });
  }, []);

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

  const startMessage = async () => {
    if (starting) return;
    setStarting(true);
    const r = await getOrCreateConversationAction(pgWsId);
    if (r.ok) {
      router.push(`/messages?c=${r.conversationId}`);
      return;
    }
    // 실패 시에도 사용자를 가두지 않는다 — 메시지 목록으로.
    setStarting(false);
    router.push('/messages');
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--md-sys-color-surface)] px-6">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="relative z-10 flex w-full max-w-[480px] flex-col items-center gap-6 text-center"
      >
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]">
          <Check className="size-8" strokeWidth={2} />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <h1 className="text-title-large">{pgName}를 선정했어요</h1>
          <p className="text-body-medium text-on-surface-variant">견적 요청이 마무리됐어요</p>
        </div>

        <div className="w-full text-left">
          <ImprovementSummary bid={bid} current={current} tier={tier} />
        </div>

        <div className="flex w-full flex-col gap-2">
          <Button onClick={startMessage} disabled={starting}>
            {starting ? 'LOADING…' : `${pgName}와 메시지 시작 →`}
          </Button>
          <Button variant="text" onClick={() => router.push('/rfp')}>
            견적 목록으로
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
