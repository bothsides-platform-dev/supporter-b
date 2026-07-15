'use client';

import { useEffect, useState, type CSSProperties } from 'react';

import { Button } from '@/components/primitives/Button';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

import type { CoachmarkStep } from './types';

const SPOTLIGHT_PADDING = 4;
const BUBBLE_OFFSET = 8;
const BUBBLE_WIDTH = 280;
const VIEWPORT_MARGIN = 8;
const OVERLAY_Z = 50;

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
  // 타깃 밖 클릭 1회성 유도 플래시 상태. stepIndex를 함께 저장해 step 전환 시 이전
  // step의 nudge가 새 step에 잘못 이어붙지 않게 한다(리셋 effect 없이 비교만으로 해소 —
  // CoachmarkTour가 key 없이 같은 오버레이 인스턴스를 재사용하므로 상태가 자연 초기화되지
  // 않음). target이 아니라 stepIndex로 비교하는 이유: 같은 target 문자열을 연속으로 쓰는
  // step이 있을 수 있어(예: notFound 스킵), target만 비교하면 그 경우 새 step에 이전
  // nudge가 새어든다.
  const [nudge, setNudge] = useState({ stepIndex, count: 0 });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 matchMedia를 1회 읽어 반영하는 의도된 동기화(SSR엔 window 없음)
    setReducedMotion(prefersReducedMotion());
  }, []);

  const isAction = step.kind === 'action';
  const isNudging = nudge.stepIndex === stepIndex && nudge.count > 0;

  const handleNudge = () => {
    setNudge((prev) => ({
      stepIndex,
      count: prev.stepIndex === stepIndex ? prev.count + 1 : 1,
    }));
  };

  const padded = {
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  };

  // 모션 하드룰(DESIGN.md): 레이아웃 속성은 애니메이션하지 않는다. 위치는 항상 즉시
  // 반영(스크롤 추종 시 실드 구멍이 타깃과 어긋나 클릭을 삼키는 문제도 함께 방지),
  // step 전환의 등장만 opacity 페이드 — key={step.target} 리마운트로 재생한다.
  // (링은 더 이상 이 fadeClass를 쓰지 않는다 — coachmark-pulse가 자체 키프레임으로
  // 페이드를 소유한다. 말풍선 dialog만 여전히 이 유틸 클래스로 페이드한다.)
  const fadeClass = reducedMotion ? '' : 'animate-in fade-in-0 duration-150';
  // 스포트라이트 링 소프트 펄스(온보딩 시선 유도) — opacity 전용, reduced-motion 존중
  // (DESIGN.md §6). CSS media 게이트로도 충분하지만, fadeClass와 동일하게 컴포넌트
  // 쪽에서도 분기해 reduced 시 클래스 자체를 붙이지 않는다.
  const pulseClass = reducedMotion ? '' : 'coachmark-pulse';
  // 밖 클릭 유도 플래시 — action은 링, info는 말풍선(내부 래퍼)에 붙인다(진행 수단이
  // 다르므로). reduced-motion으로 게이트하지 않는다 — 정지는 globals.css 미디어
  // 쿼리가 담당(클래스 자체는 항상 반영해 "밖 클릭이 인식됐다"는 상태는 유지).
  const ringNudgeClass = isAction && isNudging ? 'coachmark-nudge' : '';
  const bubbleNudgeClass = !isAction && isNudging ? 'coachmark-nudge' : '';

  const bubble = (
    <div
      // key는 step.target 고정 — nudge count를 넣지 않는다. 말풍선(dialog)은 리마운트
      // 대상이 아니다: 밖 클릭마다 리마운트하면 dialog 안의 포커스가 body로 유실되고
      // 스크린리더가 재공지해 접근성이 나빠진다(nudge는 내부 래퍼가 애니메이션
      // class 토글만으로 재생 — 아래 flash 참고).
      key={`bubble-${step.target}`}
      role="dialog"
      aria-label={step.title}
      // 말풍선 내부 클릭(버튼 포함)이 root까지 버블돼 유도 플래시가 오발되지 않게 막는다.
      onClick={(event) => event.stopPropagation()}
      style={
        isAction
          ? { ...computeBubbleStyle(rect, step.placement), pointerEvents: 'auto' }
          : computeBubbleStyle(rect, step.placement)
      }
      className={`rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--color-popover)] p-3 shadow-md ring-1 ring-foreground/10 ${fadeClass}`}
    >
      <div
        data-slot="coachmark-bubble-flash"
        className={bubbleNudgeClass}
        // 원샷 넛지가 끝나면 클래스를 스스로 떼어낸다 — 리마운트 없이도 다음 밖 클릭에서
        // class가 다시 붙어(off→on) 애니메이션이 재생된다(replay). JSX onAnimationEnd
        // 대신 ref 콜백으로 네이티브 리스너를 직접 붙인다: jsdom은 window.AnimationEvent를
        // 구현하지 않아 React가 애니메이션 이벤트명을 벤더 프리픽스로 오탐지해 합성
        // onAnimationEnd가 전혀 발화하지 않는 환경 격차가 있다 — 네이티브 리스너는 이
        // 문제와 무관하게 항상 동작한다(React 19 ref 콜백의 cleanup 반환으로 등록/해제).
        ref={(el) => {
          if (!el) return;
          // animationend는 자손에서도 버블링된다 — 넛지 키프레임의 종료만 리셋한다
          // (무관한 애니메이션이 넛지를 조기 해제하지 않게).
          const handleAnimationEnd = (event: AnimationEvent) => {
            if (event.animationName !== 'coachmark-nudge') return;
            setNudge((prev) => ({ ...prev, count: 0 }));
          };
          el.addEventListener('animationend', handleAnimationEnd);
          return () => el.removeEventListener('animationend', handleAnimationEnd);
        }}
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
    </div>
  );

  // 구멍 주위 4-rect 클릭 실드 — 배경색 없는 투명 실드(dim 스크림 제거, 배경은 밝게
  // 유지). action에서는 각 rect가 pointer-events:auto로 밖 클릭을 흡수하고 구멍(요소
  // 없음)만 실제 타깃으로 클릭을 통과시킨다. info에서는 root가 전 화면을 흡수하므로
  // 실드는 구조 통일을 위해서만 존재한다. 두 모드 모두 밖 클릭은 유도 플래시를 튕긴다.
  const shieldBase: CSSProperties = {
    position: 'fixed',
    pointerEvents: 'auto',
    zIndex: OVERLAY_Z,
  };
  const shieldRects: CSSProperties[] = [
    { ...shieldBase, top: 0, left: 0, right: 0, height: Math.max(0, padded.top) },
    { ...shieldBase, top: padded.top + padded.height, left: 0, right: 0, bottom: 0 },
    { ...shieldBase, top: padded.top, left: 0, width: Math.max(0, padded.left), height: padded.height },
    {
      ...shieldBase,
      top: padded.top,
      left: padded.left + padded.width,
      right: 0,
      height: padded.height,
    },
  ];

  const shields = shieldRects.map((style, index) => (
    <div
      key={index}
      data-slot="coachmark-shield"
      style={style}
      onClick={(event) => {
        event.stopPropagation();
        handleNudge();
      }}
    />
  ));

  // 링은 fadeClass(animate-in)를 쓰지 않는다 — coachmark-pulse가 자체 키프레임
  // (coachmark-fade-in)으로 등장 페이드를 소유해, tw-animate 레이어드 유틸과의
  // 충돌로 페이드가 씹히는 문제를 없앤다. 넛지는 key에 count를 반영해 리마운트로
  // 재생한다 — 링은 pointer-events:none 장식 요소라 리마운트해도 포커스/a11y 영향이
  // 없다(말풍선과 달리).
  const ring = (
    <div
      key={`ring-${step.target}-${ringNudgeClass ? nudge.count : 0}`}
      data-slot="coachmark-ring"
      className={`${pulseClass} ${ringNudgeClass}`}
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

  if (isAction) {
    // 클릭-스루 스포트라이트: root는 pointer-events:none — 구멍 영역엔 요소가 없어
    // 사용자의 클릭이 실제 타깃에 닿는다.
    return (
      <div data-slot="coachmark-overlay" className="fixed inset-0 z-50 pointer-events-none">
        {shields}
        {ring}
        {bubble}
      </div>
    );
  }

  return (
    <div
      data-slot="coachmark-overlay"
      className="fixed inset-0 z-50"
      // 스포트라이트 밖 전체 화면 클릭도 흡수한다 — "읽고 다음" 모델(투어를 우회해
      // 뒤 화면 요소를 조작하지 못하게). 밖 클릭은 말풍선 유도 플래시도 튕긴다.
      onClick={(event) => {
        event.stopPropagation();
        handleNudge();
      }}
    >
      {shields}
      {ring}
      {bubble}
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
