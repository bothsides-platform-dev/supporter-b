'use client';

import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring } from 'motion/react';

// CTA 마그네틱 호버 — 포인터가 요소 위에 있는 동안 커서 방향으로 살짝(±maxPx) 끌리고,
// 벗어나면 스프링으로 복귀한다. (pointer:fine) 전용 — 터치 기기에서는 아무것도 하지 않는다.
// 반환은 튜플: 객체로 감싸면 react-hooks/refs가 모든 프로퍼티 접근을 렌더 중 ref 접근으로
// 오탐한다. 구조분해해 쓰면 일반 useRef 패턴과 동일하게 취급된다.
export function useMagneticHover<T extends HTMLElement>(maxPx = 6) {
  const ref = useRef<T>(null);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 260, damping: 22 });
  const y = useSpring(rawY, { stiffness: 260, damping: 22 });

  useEffect(() => {
    // matchMedia 미정의(jsdom 등) 환경 방어 — 전역 stub 주입 대신 훅이 스스로 안전해야 한다.
    if (typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const el = ref.current;
    if (!el) return;

    const clamp = (v: number) => Math.max(-maxPx, Math.min(maxPx, v));
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      rawX.set(clamp((e.clientX - (r.left + r.width / 2)) * 0.14));
      rawY.set(clamp((e.clientY - (r.top + r.height / 2)) * 0.14));
    };
    const onLeave = () => {
      rawX.set(0);
      rawY.set(0);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [maxPx, rawX, rawY]);

  return [ref, x, y] as const;
}
