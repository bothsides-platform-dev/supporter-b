'use client';

// 견적 선정 직후 1회만 뜨는 전체 화면 축하 결과 — 히어로(선정 PG·완료) + 혜택 요약
// (ImprovementSummary 재사용) + 컨페티(useCelebrationConfetti 공용 훅). 주 CTA는
// getOrCreateConversationAction으로 선정 PG와의 빈 대화를 보장하고 메시지로 딥링크.
// Linear 하드룰의 "축하 모먼트" 승인 예외(DESIGN.md §9) — 이 화면 한정.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '@/components/primitives/Button';
import { ImprovementSummary, type CurrentConditions } from './ImprovementSummary';
import { getOrCreateConversationAction } from '@/lib/server/actions/chat/getOrCreateConversationAction';
import { useCelebrationConfetti } from '@/lib/hooks/useCelebrationConfetti';
import { josa } from 'es-hangul';
import type { Bid, MerchantTier } from '@/lib/types/bid';

export function AwardResult({
  pgName,
  pgWsId,
  bid,
  current,
  tier,
}: {
  pgName: string;
  pgWsId: string;
  bid: Bid;
  current: CurrentConditions;
  tier?: MerchantTier;
}) {
  const router = useRouter();
  const { canvasRef } = useCelebrationConfetti();
  const [starting, setStarting] = useState(false);

  const startMessage = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const r = await getOrCreateConversationAction(pgWsId);
      if (r.ok) {
        router.push(`/messages?c=${r.conversationId}`);
        return;
      }
    } catch {
      // 액션이 throw해도 사용자를 LOADING…에 가두지 않는다.
    }
    // 실패(결과 ok=false 또는 throw) 시 메시지 목록으로 — 가두지 않는다.
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
          <h1 className="text-title-large">{josa(pgName, '을/를')} 선정했어요</h1>
          <p className="text-body-medium text-on-surface-variant">견적 요청이 마무리됐어요</p>
        </div>

        <div className="w-full text-left">
          <ImprovementSummary bid={bid} current={current} tier={tier} />
        </div>

        <div className="flex w-full flex-col gap-2">
          <Button onClick={startMessage} disabled={starting}>
            {starting ? 'LOADING…' : `${josa(pgName, '와/과')} 메시지 시작 →`}
          </Button>
          <Button variant="text" onClick={() => router.push('/rfp')}>
            견적 목록으로
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
