'use client';

// 가상 샘플 온보딩 — PG 투어의 견적 제출 후 결과 화면. 실제 견적 요청의 선정 축하
// (components/inbox/SamplePgAwardCelebration.tsx, DB 시드 기반 옛 플로우)와 시각 셸
// (useCelebrationConfetti + 카드형 레이아웃)은 재사용하되, 프레이밍은 '샘플 체험 완료'로
// 다르다 — 실제로는 아직 아무도 선정하지 않았고(제출만 했을 뿐), 봉인입찰 안내 문구를
// 추가로 보여준다. 그 컴포넌트를 직접 마운트하지 않는 이유는 문구·CTA가 이 화면
// 전용이라서다(props 로 오버라이드할 표면이 없다).
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Button } from '@/components/primitives/Button';
import { useCelebrationConfetti } from '@/lib/hooks/useCelebrationConfetti';

export function SamplePgResultScreen({ buyerName }: { buyerName: string }) {
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
          <h1 className="text-title-large">샘플 체험 완료</h1>
          <p className="text-body-medium text-on-surface-variant">
            {buyerName}에게 견적을 보냈어요. 실제 견적 요청도 이렇게 작성하고 제출해요.
          </p>
          <p className="text-body-medium text-on-surface-variant">
            다른 PG의 견적과 참여 수는 서로 공개되지 않아요
          </p>
        </div>
        <Button onClick={() => router.push('/inbox')}>받은 요청으로 돌아가기</Button>
      </motion.div>
    </div>
  );
}
