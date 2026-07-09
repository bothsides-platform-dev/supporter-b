'use client';

import { motion, useReducedMotion } from 'motion/react';
import { BRAND_MARK_PATH } from '@/lib/brand/brand-mark-path';

// 표준 커브 — 강한 감속 커브(EASE_DECEL)는 초반에 외곽선을 거의 다 그려버려 draw 진행이 체감되지 않는다
const EASE_STANDARD = [0.4, 0, 0.2, 1] as const;

/**
 * 마운트 시 1회 stroke draw-on → fill fade로 등장하는 BrandMark.
 * 하드 로드(새로고침/최초 진입)마다 재생되고, 클라이언트 라우트 전환에서는
 * 셸이 리마운트되지 않으므로 재생되지 않는다.
 * - draw: pathLength 0→1 — 볼드용 stroke가 그대로 펜 선 역할을 한다 (서브패스 2개 동시 비례 진행)
 * - fill: draw 후반과 겹쳐 fillOpacity 0→1
 * - prefers-reduced-motion 시 애니메이션 없이 정적 렌더 (BrandMark와 동일한 결과)
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
  const color = `var(${colorVar})`;
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
        {reduce ? (
          <path
            d={BRAND_MARK_PATH}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="miter"
            strokeLinecap="butt"
          />
        ) : (
          <motion.path
            d={BRAND_MARK_PATH}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="miter"
            strokeLinecap="butt"
            initial={{ pathLength: 0, fillOpacity: 0 }}
            animate={{ pathLength: 1, fillOpacity: 1 }}
            transition={{
              pathLength: { duration: 0.6, ease: EASE_STANDARD },
              fillOpacity: { delay: 0.5, duration: 0.3, ease: 'easeOut' },
            }}
          />
        )}
      </g>
    </svg>
  );
}
