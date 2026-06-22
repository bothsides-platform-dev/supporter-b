'use client';

import { Check } from 'lucide-react';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import type { MarkerState } from '@/lib/rfp/required-fields';

const CONFIG: Record<MarkerState, { color: ChipColor; label: string; icon?: React.ReactNode }> = {
  empty: { color: 'surface', label: '필수' },
  filled: { color: 'tertiary', label: '입력 완료', icon: <Check /> },
  error: { color: 'error', label: '필수' },
};

export function RequiredMark({ state }: { state: MarkerState }) {
  const { color, label, icon } = CONFIG[state];
  return <Chip variant="assist" color={color} label={label} icon={icon} />;
}
