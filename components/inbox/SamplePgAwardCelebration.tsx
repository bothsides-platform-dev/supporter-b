'use client';

// PG 온보딩 샘플 — 견적을 제출하고 잠시 뒤 1회만 뜨는 전체 화면 축하 결과(PG 관점).
// 구매사용 AwardResult 의 거울이되 카피·CTA 가 "내 견적이 선정됨" 관점이다. 컨페티는
// useCelebrationConfetti 공용 훅 재사용. Linear 하드룰의 "축하 모먼트" 승인 예외(DESIGN.md §9)
// — 이 화면 한정.
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { josa } from 'es-hangul';
import { Button } from '@/components/primitives/Button';
import { useCelebrationConfetti } from '@/lib/hooks/useCelebrationConfetti';

export function SamplePgAwardCelebration({ buyerName }: { buyerName: string }) {
  const router = useRouter();
  const { canvasRef } = useCelebrationConfetti();

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
          <h1 className="text-title-large">견적이 선정됐어요</h1>
          <p className="text-body-medium text-on-surface-variant">
            {josa(buyerName, '이/가')} 회원님의 견적을 선정했어요. 실제 견적 요청도 이렇게 받아 제안할 수 있어요.
          </p>
        </div>
        <Button onClick={() => router.push('/inbox')}>둘러보기 끝내기</Button>
      </motion.div>
    </div>
  );
}
