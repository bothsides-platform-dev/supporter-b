'use client';

import { useRef } from 'react';
import * as RadixSlider from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

type SliderProps = {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number, interaction: 'pointer' | 'keyboard') => void;
  ariaValueText?: string;
  ariaLabel?: string;
  className?: string;
};

export function Slider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  onValueCommit,
  ariaValueText,
  ariaLabel,
  className,
}: SliderProps) {
  const interaction = useRef<'pointer' | 'keyboard'>('keyboard');
  return (
    <RadixSlider.Root
      className={cn(
        // touch-pan-y: 세로 스와이프(스크롤)는 브라우저에 넘기고 가로 드래그(값 조정)만
        // 슬라이더가 캡처한다. touch-none 은 세로 스크롤까지 삼켜 모바일에서 슬라이더 위를
        // 지날 때 페이지 스크롤이 걸리게 한다. 현행 슬라이더는 전부 가로.
        'relative flex items-center select-none touch-pan-y w-full h-5',
        className,
      )}
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onValueChange(v[0])}
      onPointerDownCapture={() => { interaction.current = 'pointer'; }}
      onKeyDownCapture={() => { interaction.current = 'keyboard'; }}
      onValueCommit={(v) => onValueCommit?.(v[0], interaction.current)}
    >
      <RadixSlider.Track className="relative grow h-px bg-[var(--md-sys-color-outline)]">
        <RadixSlider.Range className="absolute h-px bg-[var(--md-sys-color-on-surface)]" />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        aria-label={ariaLabel}
        aria-valuetext={ariaValueText}
        className={cn(
          'block w-[14px] h-[14px] bg-[var(--md-sys-color-surface)]',
          'border border-[var(--md-sys-color-on-surface)] rounded-md',
          'transition-transform duration-[140ms]',
          'hover:scale-110',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]',
        )}
      />
    </RadixSlider.Root>
  );
}
