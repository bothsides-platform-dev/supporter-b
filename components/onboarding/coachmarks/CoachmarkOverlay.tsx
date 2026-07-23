'use client';

import { useEffect, useState, type CSSProperties } from 'react';

import { Button } from '@/components/primitives/Button';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

import type { CoachmarkStep } from './types';

const SPOTLIGHT_PADDING = 4;
const BUBBLE_OFFSET = 8;
const BUBBLE_WIDTH = 280;
const VIEWPORT_MARGIN = 8;
// ui/dialog(backdrop·panel)의 z-50보다 높아야 한다 — pgWriteTour 마지막 스텝이
// 제출 ConfirmDialog "안"의 확인 버튼을 링하는데, 다이얼로그는 body 끝 포털이라
// 같은 z면 문서 순서로 이겨 링·말풍선이 불투명 패널에 가려진다.
const OVERLAY_Z = 60;
// top/bottom 배치 뒤집기 판정 여유값.
const FLIP_MARGIN_PX = 40;
// 좌/우 배치 세로 클램프용 대략적 말풍선 높이 여유.
const BUBBLE_HEIGHT_ESTIMATE_PX = 160;

export type CoachmarkOverlayProps = {
  rect: DOMRect;
  step: CoachmarkStep;
  stepIndex: number;
  stepCount: number;
  onNext: () => void;
  onSkip: () => void;
  isLast: boolean;
  /** action 타깃이 disabled(:disabled/aria-disabled)면 true — 막힘 감지 힌트를 노출한다. */
  targetDisabled?: boolean;
};

export function CoachmarkOverlay({
  rect,
  step,
  stepIndex,
  stepCount,
  onNext,
  onSkip,
  isLast,
  targetDisabled,
}: CoachmarkOverlayProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  // 스크린리더 공지 텍스트 — 마운트 "후" effect로 채워야 첫 스텝도 라이브 리전
  // 변경으로 공지된다(내용을 품은 채 마운트된 리전은 공지되지 않음).
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 matchMedia를 1회 읽어 반영하는 의도된 동기화(SSR엔 window 없음)
    setReducedMotion(prefersReducedMotion());
  }, []);

  useEffect(() => {
    // 스텝 전환은 사용자 클릭 없이도 일어난다(오프코스 리졸버 점프) — 시각 링만으로는
    // 비시각 사용자에게 전달되지 않으므로 폴라이트 라이브 리전으로 현재 안내를 공지한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 라이브 리전은 마운트 후 텍스트가 "변경"돼야 공지되는 의도된 동기화
    setAnnouncement(`${step.title} ${step.body}`);
  }, [step.title, step.body]);

  const isAction = step.kind === 'action';

  const padded = {
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  };

  // 모션 하드룰(DESIGN.md): 레이아웃 속성은 애니메이션하지 않는다. 위치는 항상 즉시
  // 반영, step 전환의 등장만 opacity 페이드 — key={step.target} 리마운트로 재생한다.
  // (링은 더 이상 이 fadeClass를 쓰지 않는다 — coachmark-pulse가 자체 키프레임으로
  // 페이드를 소유한다. 말풍선 dialog만 여전히 이 유틸 클래스로 페이드한다.)
  const fadeClass = reducedMotion ? '' : 'animate-in fade-in-0 duration-150';
  // 스포트라이트 링 소프트 펄스(온보딩 시선 유도) — opacity 전용, reduced-motion 존중
  // (DESIGN.md §6). CSS media 게이트로도 충분하지만, fadeClass와 동일하게 컴포넌트
  // 쪽에서도 분기해 reduced 시 클래스 자체를 붙이지 않는다.
  const pulseClass = reducedMotion ? '' : 'coachmark-pulse';

  const bubble = (
    <div
      // key는 step.target 고정 — step 리렌더에도 dialog가 리마운트되지 않아 포커스/스크린리더 재공지를 피한다.
      key={`bubble-${step.target}`}
      role="dialog"
      aria-label={step.title}
      style={{ ...computeBubbleStyle(rect, step.placement), pointerEvents: 'auto' }}
      className={`rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--color-popover)] p-3 shadow-md ring-1 ring-foreground/10 ${fadeClass}`}
    >
      <p className="text-sm font-semibold text-foreground">{step.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
      {isAction && targetDisabled && (
        <p className="mt-2 text-[12px] text-[var(--md-sys-color-error)]">
          입력이 비었거나 형식이 달라요. 고치면 계속 진행할 수 있어요.
        </p>
      )}
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

  // 링은 fadeClass(animate-in)를 쓰지 않는다 — coachmark-pulse가 자체 키프레임
  // (coachmark-fade-in)으로 등장 페이드를 소유해, tw-animate 레이어드 유틸과의
  // 충돌로 페이드가 씹히는 문제를 없앤다.
  const ring = (
    <div
      key={`ring-${step.target}`}
      data-slot="coachmark-ring"
      className={pulseClass}
      style={{
        position: 'fixed',
        ...padded,
        borderRadius: 6,
        border: '2px solid var(--md-sys-color-primary)',
        pointerEvents: 'none',
        zIndex: OVERLAY_Z,
      }}
    />
  );

  // 오픈 샌드박스: 오버레이는 어떤 클릭도 막지 않는다 — root는 항상
  // pointer-events:none, 실드도 없다. 안내(링 펄스 + 말풍선)만 남고, 진행은
  // CoachmarkTour가 소유한다(action: document capture 클릭 리스너로 실제 타깃 클릭을
  // 감지, info: 말풍선의 다음/확인 버튼). 말풍선만 pointer-events:auto로 버튼을 누를
  // 수 있게 한다.
  return (
    <div
      data-slot="coachmark-overlay"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: OVERLAY_Z }}
    >
      {ring}
      {bubble}
      {/* aria-live 명시 — Base-UI modal(제출 확인창)이 열리면 포털 밖 전부가
          aria-hidden 마킹되는데, 명시적 [aria-live] 요소만 제외돼 확인 스텝의
          전환 공지가 살아남는다. 그 동안 말풍선·건너뛰기는 포커스 트랩 밖(수용) —
          키보드 탈출로는 다이얼로그 Esc→취소→리졸버가 제출 스텝으로 복귀. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}

function computeBubbleStyle(
  rect: DOMRect,
  placement: CoachmarkStep['placement'],
): CSSProperties {
  const base: CSSProperties = {
    position: 'fixed',
    width: BUBBLE_WIDTH,
    maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
    opacity: 1,
    zIndex: OVERLAY_Z + 1,
  };

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768;

  let effectivePlacement = placement;
  // 뷰포트 밖으로 나가면 반대편으로 뒤집는 최소한의 클램프.
  if (placement === 'bottom' && rect.bottom + BUBBLE_OFFSET + FLIP_MARGIN_PX > viewportHeight) {
    effectivePlacement = 'top';
  } else if (placement === 'top' && rect.top - BUBBLE_OFFSET - FLIP_MARGIN_PX < 0) {
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
// 잘린다 — 세로 위치를 뷰포트 안으로 클램프한다.
function clampTop(top: number, viewportHeight: number): number {
  const min = VIEWPORT_MARGIN;
  const max = Math.max(min, viewportHeight - BUBBLE_HEIGHT_ESTIMATE_PX);
  return Math.min(Math.max(top, min), max);
}
