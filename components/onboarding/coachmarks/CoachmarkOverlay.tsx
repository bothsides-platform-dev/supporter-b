'use client';

import { useEffect, useState, type CSSProperties } from 'react';

import { Button } from '@/components/primitives/Button';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

import type { CoachmarkStep } from './types';

const SPOTLIGHT_PADDING = 4;
const BUBBLE_OFFSET = 8;
const BUBBLE_WIDTH = 280;
const VIEWPORT_MARGIN = 8;

export type CoachmarkOverlayProps = {
  rect: DOMRect;
  step: CoachmarkStep;
  stepIndex: number;
  stepCount: number;
  onNext: () => void;
  onSkip: () => void;
  isLast: boolean;
};

export function CoachmarkOverlay({
  rect,
  step,
  stepIndex,
  stepCount,
  onNext,
  onSkip,
  isLast,
}: CoachmarkOverlayProps) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 matchMedia를 1회 읽어 반영하는 의도된 동기화(SSR엔 window 없음)
    setReducedMotion(prefersReducedMotion());
  }, []);

  const isAction = step.kind === 'action';

  const padded = {
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  };

  const rectTransition = reducedMotion
    ? 'none'
    : 'top 200ms, left 200ms, width 200ms, height 200ms';

  const spotlightStyle: CSSProperties = {
    position: 'fixed',
    ...padded,
    borderRadius: 6,
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
    transition: rectTransition,
    zIndex: 50,
  };

  const bubbleStyle = computeBubbleStyle(rect, step.placement, reducedMotion);

  const bubble = (
    <div
      role="dialog"
      aria-label={step.title}
      style={isAction ? { ...bubbleStyle, pointerEvents: 'auto' } : bubbleStyle}
      className="rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--color-popover)] p-3 shadow-md ring-1 ring-foreground/10"
    >
      <p className="text-sm font-semibold text-foreground">{step.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {stepIndex + 1}/{stepCount}
        </span>
        <div className="flex gap-1.5">
          <Button type="button" variant="text" size="sm" onClick={onSkip}>
            건너뛰기
          </Button>
          {/* action step은 실제 타깃 클릭이 곧 진행 — 말풍선엔 다음/확인 버튼이 없다. */}
          {!isAction && (
            <Button type="button" variant="filled" size="sm" onClick={onNext}>
              {isLast ? '확인' : '다음'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  if (isAction) {
    // 클릭-스루 스포트라이트: root는 pointer-events:none, 구멍 주위 4개 dim 스트립만
    // 클릭을 흡수한다 — 구멍 영역엔 요소가 없어 사용자의 클릭이 실제 타깃에 닿는다.
    const dimBase: CSSProperties = {
      position: 'fixed',
      background: 'rgba(0, 0, 0, 0.5)',
      pointerEvents: 'auto',
      transition: rectTransition,
      zIndex: 50,
    };
    const dimRects: CSSProperties[] = [
      { ...dimBase, top: 0, left: 0, right: 0, height: Math.max(0, padded.top) },
      { ...dimBase, top: padded.top + padded.height, left: 0, right: 0, bottom: 0 },
      { ...dimBase, top: padded.top, left: 0, width: Math.max(0, padded.left), height: padded.height },
      { ...dimBase, top: padded.top, left: padded.left + padded.width, right: 0, height: padded.height },
    ];
    return (
      <div data-slot="coachmark-overlay" className="fixed inset-0 z-50 pointer-events-none">
        {dimRects.map((style, index) => (
          <div
            key={index}
            data-slot="coachmark-dim"
            style={style}
            onClick={(event) => event.stopPropagation()}
          />
        ))}
        <div
          data-slot="coachmark-ring"
          style={{
            position: 'fixed',
            ...padded,
            borderRadius: 6,
            border: '2px solid var(--md-sys-color-primary)',
            pointerEvents: 'none',
            transition: rectTransition,
            zIndex: 50,
          }}
        />
        {bubble}
      </div>
    );
  }

  return (
    <div
      data-slot="coachmark-overlay"
      className="fixed inset-0 z-50"
      // 스포트라이트 밖 전체 화면 클릭도 흡수한다 — "읽고 다음" 모델(투어를 우회해
      // 뒤 화면 요소를 조작하지 못하게).
      onClick={(event) => event.stopPropagation()}
    >
      <div style={spotlightStyle} />
      {bubble}
    </div>
  );
}

function computeBubbleStyle(
  rect: DOMRect,
  placement: CoachmarkStep['placement'],
  reducedMotion: boolean,
): CSSProperties {
  const base: CSSProperties = {
    position: 'fixed',
    width: BUBBLE_WIDTH,
    maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
    opacity: 1,
    transition: reducedMotion ? 'none' : 'top 200ms, left 200ms, opacity 150ms',
    zIndex: 51,
  };

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768;

  let effectivePlacement = placement;
  // 뷰포트 밖으로 나가면 반대편으로 뒤집는 최소한의 클램프.
  if (placement === 'bottom' && rect.bottom + BUBBLE_OFFSET + 40 > viewportHeight) {
    effectivePlacement = 'top';
  } else if (placement === 'top' && rect.top - BUBBLE_OFFSET - 40 < 0) {
    effectivePlacement = 'bottom';
  } else if (placement === 'right' && rect.right + BUBBLE_OFFSET + BUBBLE_WIDTH > viewportWidth) {
    effectivePlacement = 'left';
  } else if (placement === 'left' && rect.left - BUBBLE_OFFSET - BUBBLE_WIDTH < 0) {
    effectivePlacement = 'right';
  }

  switch (effectivePlacement) {
    case 'top':
      return {
        ...base,
        left: clamp(rect.left, viewportWidth),
        top: rect.top - BUBBLE_OFFSET,
        transform: 'translateY(-100%)',
      };
    case 'left':
      return {
        ...base,
        left: clamp(rect.left - BUBBLE_OFFSET - BUBBLE_WIDTH, viewportWidth),
        top: clampTop(rect.top, viewportHeight),
      };
    case 'right':
      return {
        ...base,
        left: clamp(rect.right + BUBBLE_OFFSET, viewportWidth),
        top: clampTop(rect.top, viewportHeight),
      };
    case 'bottom':
    default:
      return {
        ...base,
        left: clamp(rect.left, viewportWidth),
        top: rect.bottom + BUBBLE_OFFSET,
      };
  }
}

function clamp(left: number, viewportWidth: number): number {
  const min = VIEWPORT_MARGIN;
  const max = viewportWidth - BUBBLE_WIDTH - VIEWPORT_MARGIN;
  return Math.min(Math.max(left, min), Math.max(min, max));
}

// 좌/우 배치에서 타깃이 뷰포트 위(rect.top<0)나 아래로 걸치면 말풍선이 화면 밖으로
// 잘린다 — 세로 위치를 뷰포트 안으로 클램프한다(대략적 말풍선 높이 여유 160px).
function clampTop(top: number, viewportHeight: number): number {
  const min = VIEWPORT_MARGIN;
  const max = Math.max(min, viewportHeight - 160);
  return Math.min(Math.max(top, min), max);
}
