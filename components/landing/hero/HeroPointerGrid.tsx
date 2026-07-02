'use client';

import { useEffect, useRef } from 'react';

// 다크 오프닝 씬 배경 — 플랫 도트 그리드 2겹.
// 베이스 겹은 은은한 잉크 도트, 하이라이트 겹은 inverse-primary 도트를 radial mask로 커서
// 주변만 노출한다. 블러·글로우가 아니라 마스크로 도트의 '색'만 바뀌므로 §9:322(네온/블러 오브
// 금지)를 지킨다. 커서 추적은 (pointer:fine)에서만 — 터치 기기는 정적 베이스 그리드만 보인다.
const GRID_SIZE = '26px 26px';
const BASE_DOT =
  'radial-gradient(circle, color-mix(in srgb, var(--md-sys-color-inverse-on-surface) 11%, transparent) 1px, transparent 1.5px)';
const HIGHLIGHT_DOT =
  'radial-gradient(circle, color-mix(in srgb, var(--md-sys-color-inverse-primary) 60%, transparent) 1px, transparent 1.5px)';
// 기본 커서 좌표는 화면 밖 — 포인터가 움직이기 전에는 하이라이트가 전혀 보이지 않는다.
const HIGHLIGHT_MASK =
  'radial-gradient(200px circle at var(--hero-mx, -999px) var(--hero-my, -999px), black 30%, transparent 75%)';

export function HeroPointerGrid() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // matchMedia 미정의(jsdom 등) 환경 방어 — 전역 stub 주입 대신 훅이 스스로 안전해야 한다.
    if (typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let last: PointerEvent | null = null;
    const onMove = (e: PointerEvent) => {
      last = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!last) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--hero-mx', `${last.clientX - r.left}px`);
        el.style.setProperty('--hero-my', `${last.clientY - r.top}px`);
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className="absolute inset-0">
      <div
        className="absolute inset-0"
        style={{ backgroundImage: BASE_DOT, backgroundSize: GRID_SIZE }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: HIGHLIGHT_DOT,
          backgroundSize: GRID_SIZE,
          maskImage: HIGHLIGHT_MASK,
          WebkitMaskImage: HIGHLIGHT_MASK,
        }}
      />
    </div>
  );
}
