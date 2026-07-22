'use client';

// 튜토리얼 플로우(buyer/pg)가 공유하는 화면 골격 — 이탈 가드, 진행 헤더, 나가기
// 버튼, 완료 컨페티 캔버스. 안쪽 여정(phase 별 실제 화면)만 각 플로우가 채운다.
import { Button } from '@/components/primitives/Button';
import { Divider } from '@/components/primitives/Divider';
import { useCelebrationConfetti } from '@/lib/hooks/useCelebrationConfetti';
import { TutorialLeaveGuard } from './TutorialLeaveGuard';

type TutorialFlowShellProps = {
  variant: 'buyer' | 'pg';
  stepNum: number;
  total: number;
  label: string;
  isDone: boolean;
  onExit: () => void;
  children: React.ReactNode;
};

export function TutorialFlowShell({
  variant,
  stepNum,
  total,
  label,
  isDone,
  onExit,
  children,
}: TutorialFlowShellProps) {
  const { canvasRef } = useCelebrationConfetti();

  return (
    <div className="flex flex-1 flex-col">
      {!isDone && <TutorialLeaveGuard variant={variant} />}
      {/* useCelebrationConfetti 는 캔버스 마운트 시 자동 발사하는 계약(축하 순간에
          마운트되는 화면용) — 상시 마운트하면 튜토리얼 시작 시 터진다. done 에서만. */}
      {isDone && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-50 h-full w-full"
        />
      )}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
            {stepNum} / {total} — {label}
          </span>
          <Divider />
        </div>
        <Button variant="text" size="sm" onClick={onExit}>
          튜토리얼 나가기
        </Button>
      </div>

      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
