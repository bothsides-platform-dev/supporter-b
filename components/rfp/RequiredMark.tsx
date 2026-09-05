'use client';

import { Check } from 'lucide-react';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import type { MarkerState } from '@/lib/rfp/required-fields';

const CONFIG: Record<MarkerState, { color: ChipColor; label: string; icon?: React.ReactNode }> = {
  empty: { color: 'surface', label: '필수' },
  filled: { color: 'tertiary', label: '입력 완료', icon: <Check /> },
  error: { color: 'error', label: '필수' },
};

export function RequiredMark({ state, filledLabel }: { state: MarkerState; filledLabel?: string }) {
  const { color, label: defaultLabel, icon } = CONFIG[state];
  const label = state === 'filled' && filledLabel ? filledLabel : defaultLabel;
  // 좁은 2열 셀(견적 위저드 정산한도)에서 '입력 완료'가 '입력 완 / 료'로 쪼개졌다.
  // 마커는 줄이 접히면 안 되는 짧은 상태 라벨이라 넘치면 라벨 쪽이 접히게 둔다.
  return (
    <Chip
      variant="assist"
      color={color}
      label={label}
      icon={icon}
      className="whitespace-nowrap shrink-0"
    />
  );
}
