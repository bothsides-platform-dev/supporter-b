'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BRAND_MARK_PATH } from '@/lib/brand/brand-mark-path';

// 표준 커브 — 강한 감속 커브(EASE_DECEL)는 초반에 외곽선을 거의 다 그려버려 draw 진행이 체감되지 않는다
const EASE_STANDARD = [0.4, 0, 0.2, 1] as const;

/* 드로잉 전용 경로 — BRAND_MARK_PATH와 기하학적으로 동일하고 서브패스 시작점만 회전:
   - stem: M3541 9379(좌상단 모서리) → M4025 9379(윗변 중간)
   - bowl: M5405 9379(좌상단 모서리) → M6600 9379(윗변 중간)
   dash 이음새(butt 절단)는 서브패스 시작점에 생기는데, 모서리에 앉으면 미터 조인이
   파여 그리는 중·완료 직후 모두 모서리가 깨져 보인다. 직선 변 중간에 두면 절단면이
   변에 수직이라 이음새가 보이지 않는다. 기하 동일성은 테스트가 SSOT와 정점 대조로 보장. */
const DRAW_PATH =
  'M4025 9379 L4510 9379 L4510 3420 L3541 3420 L3541 9379 Z M6600 9379 L5405 9379 L5405 8345 L6570 8345 C7725 8335 7736 8335 7797 8314 C7904 8277 7990 8222 8076 8135 C8222 7988 8288 7809 8277 7590 C8267 7396 8205 7255 8070 7119 C8002 7050 7968 7025 7900 6992 C7735 6911 7812 6917 6720 6910 L5405 6910 L5405 5920 L6775 5920 L7795 5915 L7875 5887 C8063 5820 8203 5700 8284 5535 C8342 5420 8355 5354 8355 5195 C8354 5071 8351 5046 8327 4975 C8289 4860 8236 4776 8144 4684 C8077 4616 8048 4595 7969 4557 C7803 4476 7870 4480 6557 4480 L5405 4480 L5405 3420 L6644 3420 C7743 3420 7924 3422 8032 3436 C8804 3536 9345 4033 9475 4760 C9498 4888 9506 5159 9491 5301 C9439 5793 9235 6141 8838 6412 L8771 6458 L8833 6512 C9149 6786 9329 7103 9397 7500 C9421 7641 9418 7903 9392 8050 C9259 8789 8668 9305 7870 9379 L6600 9379 Z';

/**
 * 마운트 시 1회 stroke draw-on → fill fade로 등장하는 BrandMark.
 * 하드 로드(새로고침/최초 진입)마다 재생되고, 클라이언트 라우트 전환에서는
 * 셸이 리마운트되지 않으므로 재생되지 않는다.
 * - draw: pathLength 0→1 — 볼드용 stroke가 그대로 펜 선 역할을 한다 (서브패스 2개 동시 비례 진행)
 * - fill: draw 후반과 겹쳐 fillOpacity 0→1
 * - prefers-reduced-motion 시 애니메이션 없이 정적 렌더 (BrandMark와 동일한 결과)
 * - 완료 후에는 순수 <path>로 정착한다 — motion의 pathLength 구동이 남기는
 *   stroke-dasharray/pathLength 잔여 속성이 볼드 스트로크를 열화시키기 때문
 *   (획이 얇아지고 모서리가 뭉개져 보임). settled는 state 기반이라 서버·클라이언트
 *   첫 렌더 모두 false → 엘리먼트 타입이 hydration 시점에는 항상 motion.path로
 *   일치하고, 스왑은 hydration 이후에만 일어난다(reduce 직분기 시절의 불일치 회귀 방지).
 */
export function AnimatedBrandMark({
  size = 20,
  className,
  colorVar = '--md-sys-color-on-surface',
  strokeWidth = 450,
}: {
  size?: number | string
  className?: string
  colorVar?: string
  strokeWidth?: number
}) {
  const reduce = useReducedMotion();
  const [settled, setSettled] = useState(false);

  // reduced-motion은 그릴 애니메이션이 없으므로 마운트 직후 바로 정착.
  // 렌더 중 setState로 당기면 hydration 렌더에서 SSR이 심어둔 dash 속성이 DOM에
  // 잔류한 채 정적 path로 매칭되므로, 의도적으로 hydration 이후(effect)에 1회 전환한다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (reduce) setSettled(true);
  }, [reduce]);

  const color = `var(${colorVar})`;
  const staticPathProps = {
    d: BRAND_MARK_PATH,
    stroke: color,
    strokeWidth,
    strokeLinejoin: 'miter',
    strokeLinecap: 'butt',
  } as const;

  return (
    <svg
      viewBox="334 294 636 636"
      width={size}
      height={size}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <g transform="translate(0 1254) scale(0.1 -0.1)" fill={color}>
        {settled ? (
          <path {...staticPathProps} />
        ) : (
          <motion.path
            {...staticPathProps}
            d={DRAW_PATH}
            initial={reduce ? { pathLength: 1, fillOpacity: 1 } : { pathLength: 0, fillOpacity: 0 }}
            animate={{ pathLength: 1, fillOpacity: 1 }}
            transition={
              reduce
                ? { duration: 0 }
                : {
                    pathLength: { duration: 0.6, ease: EASE_STANDARD },
                    fillOpacity: { delay: 0.5, duration: 0.3, ease: 'easeOut' },
                  }
            }
            onAnimationComplete={() => setSettled(true)}
          />
        )}
      </g>
    </svg>
  );
}
