'use client';

// pg 튜토리얼 — "가상 구매사가 견적 요청에 초대했어요" 연출. 실제로는 이메일·알림으로
// 받는 초대를 인박스 알림 항목 스타일 카드로 대신 체험시킨다. 가벼운 진입 모션
// (opacity/transform만 — Linear 모션 하드룰)이며 prefers-reduced-motion 존중.
import { useEffect, useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { formatDate, formatDeadline } from '@/lib/utils/format';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

export function InviteScene({
  buyerName,
  rfpTitle,
  deadline,
  onProceed,
}: {
  buyerName: string;
  rfpTitle: string;
  deadline: string;
  onProceed: () => void;
}) {
  const [visible, setVisible] = useState(prefersReducedMotion());

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 px-8 py-10 text-center">
      <h2 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
        견적 요청에 초대됐어요
      </h2>
      <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
        실제로는 이메일과 알림으로 초대를 받아요. 지금은 튜토리얼이라 바로 보여드려요.
      </p>

      <div
        className="w-full max-w-md rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-4 py-4 text-left transition-[opacity,transform] duration-300"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
        }}
      >
        <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
          견적 요청 초대
        </p>
        <p className="mt-1 text-[15px] font-medium text-[var(--md-sys-color-on-surface)]">
          {buyerName}
        </p>
        <p className="mt-1 text-[14px] text-[var(--md-sys-color-on-surface)]">{rfpTitle}</p>
        <p className="md-numeric mt-2 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
          마감 {formatDeadline(deadline)} ({formatDate(deadline)})
        </p>
      </div>

      <Button onClick={onProceed}>요청 확인하기</Button>
    </div>
  );
}
