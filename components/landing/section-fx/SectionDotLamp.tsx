'use client';

import { useEffect, useRef } from 'react';
import {
  DOT_PITCH,
  createDotGrid,
  decayLamp,
  dotSize,
  dotValue,
  lightDots,
  stampLamp,
  type DotGrid,
  type Light,
} from '@/lib/landing/dot-lamp';

// 히어로 아래 섹션 배경 — 점 격자 손전등(2026-11-24 사용자 선택: 호버 시안 B, Increase 의 점 격자).
//  · 쉬는 동안에는 아무것도 그리지 않는다. 섹션 면만 보인다.
//  · 마우스·펜이 섹션 위를 움직이면 포인터 주변 약 130px 안의 16px 점 격자가 드러나고, 가운데에
//    가까운 점은 primary 쪽 작은 사각으로 커진다. 지나간 자리에 잔광이 남았다가 약 1초 안에 사라진다.
//  · 터치는 무시한다(섹션 위 손가락 드래그는 스크롤이다). 스크롤만으로는 아무것도 드러나지 않는다.
// 블러·그라데이션·가산 합성 없이 1~3px 사각형만 그린다 — §9 글로우 금지의 예외(⑤)를 넓히지 않는다.
// 캔버스는 섹션 높이가 아니라 화면 높이(sticky)로만 잡고, 화면 밖이면 루프를 멈추고 메모리를 비운다.
// 순수 계산은 lib/landing/dot-lamp.ts.

const DPR_CAP = 2;
const FRAME_MS = 33;
const COLOR_TIERS = 16;
/** 포인터가 이보다 오래 쉬었다 움직이면 새 궤적으로 시작한다(재진입 시 가짜 잔광 방지). */
const STROKE_IDLE_RESET_MS = 250;

type Rgb = [number, number, number];
const INK_FALLBACK: Rgb = [31, 32, 35]; // --md-sys-color-on-surface (light)
const ACCENT_FALLBACK: Rgb = [0, 97, 164]; // --md-sys-color-primary (light)

// getComputedStyle 은 브라우저에 따라 '#rrggbb' 또는 'rgb(r, g, b)' 를 돌려준다 — 둘 다 파싱.
function parseColor(raw: string, fallback: Rgb): Rgb {
  const s = raw.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(s);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return fallback;
}

function rgba([r, g, b]: Rgb, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, a)).toFixed(3)})`;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function SectionDotLamp({ salt = 0 }: { salt?: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // matchMedia 미정의(jsdom 등)에서는 아무것도 그리지 않는다 — 히어로 필드와 같은 가드.
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let disposed = false;
    let offscreen = typeof IntersectionObserver === 'function';
    let running = false;
    let rafId = 0;
    let lastFrame = 0;
    let lastTick = 0;

    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let grid: DotGrid = createDotGrid(0, 0, salt);
    const lights: Light[] = [];
    let tierStyles: string[] = [];

    // 마지막 포인터(client 좌표)와 직전에 찍은 점(캔버스 좌표).
    let pointerX = 0;
    let pointerY = 0;
    let pointerMoved = false;
    let prev: { x: number; y: number; at: number } | null = null;

    const resolvePalette = () => {
      const cs = getComputedStyle(root);
      // 반전 면(예: PG 랜딩 마지막 CTA 의 on-surface 바탕)은 섹션에 --lamp-ink·--lamp-accent 를 두어 점 색을 바꾼다.
      const pick = (override: string, token: string) => cs.getPropertyValue(override).trim() || cs.getPropertyValue(token);
      const ink = parseColor(pick('--lamp-ink', '--md-sys-color-on-surface'), INK_FALLBACK);
      const accent = parseColor(pick('--lamp-accent', '--md-sys-color-primary'), ACCENT_FALLBACK);
      const raw = Number.parseFloat(cs.getPropertyValue('--lamp-peak'));
      const peak = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.75;
      tierStyles = Array.from({ length: COLOR_TIERS }, (_, t) => {
        const e = (t + 1) / COLOR_TIERS;
        // 가장자리 점은 잉크 색 그대로 옅게, 가운데로 갈수록 primary 로 넘어간다.
        const hue = Math.min(1, Math.max(0, (e - 0.35) / 0.5));
        return rgba(mix(ink, accent, hue), peak * (0.25 + 0.75 * e));
      });
    };

    const allocate = (): boolean => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w <= 0 || h <= 0) return false;
      const nextDpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      if (w === cssW && h === cssH && nextDpr === dpr && canvas.width > 1) return true;
      cssW = w;
      cssH = h;
      dpr = nextDpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      grid = createDotGrid(w, h, salt);
      lights.length = 0;
      return true;
    };

    // 화면 밖이면 캔버스 메모리를 돌려준다(섹션마다 화면 크기 × DPR² 를 계속 들고 있지 않게).
    const release = () => {
      canvas.width = 1;
      canvas.height = 1;
      cssW = 0;
      cssH = 0;
      grid = createDotGrid(0, 0, salt);
      lights.length = 0;
      prev = null;
    };

    const draw = () => {
      const b = lightDots(grid, lights);
      if (!b) return;
      const { cols, ox, oy } = grid;
      for (let r = b.r0; r <= b.r1; r++) {
        for (let c = b.c0; c <= b.c1; c++) {
          const v = dotValue(grid, r * cols + c);
          if (v < 0.02) continue;
          const size = dotSize(v);
          ctx.fillStyle = tierStyles[Math.min(COLOR_TIERS - 1, Math.floor(v * COLOR_TIERS))];
          ctx.fillRect(
            Math.round(ox + c * DOT_PITCH - size / 2),
            Math.round(oy + r * DOT_PITCH - size / 2),
            size,
            size,
          );
        }
      }
    };

    // 포인터 이동은 좌표만 받아 두고 프레임마다 한 번 찍는다.
    const stampPointer = (now: number) => {
      if (!pointerMoved) return;
      pointerMoved = false;
      const rect = canvas.getBoundingClientRect();
      const x = pointerX - rect.left;
      const y = pointerY - rect.top;
      if (prev && now - prev.at <= STROKE_IDLE_RESET_MS) stampLamp(lights, prev.x, prev.y, x, y);
      else stampLamp(lights, x, y, x, y);
      prev = { x, y, at: now };
    };

    const frame = (now: number) => {
      if (disposed) return;
      if (document.hidden || offscreen || cssW === 0) {
        running = false;
        return;
      }
      if (now - lastFrame < FRAME_MS) {
        rafId = requestAnimationFrame(frame);
        return;
      }
      lastFrame = now;
      stampPointer(now);
      const alive = decayLamp(lights, now - lastTick);
      lastTick = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      if (alive) {
        draw();
        rafId = requestAnimationFrame(frame);
      } else {
        // 다 식었으면 빈 캔버스가 쉬는 상태다 — 다음 포인터 이동까지 루프를 멈춘다.
        running = false;
      }
    };

    const kick = () => {
      if (disposed || running || offscreen || document.hidden || cssW === 0) return;
      running = true;
      lastFrame = 0;
      lastTick = performance.now();
      rafId = requestAnimationFrame(frame);
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (ev.pointerType === 'touch' || offscreen || cssW === 0) return;
      // 이 섹션 밖의 이동은 루프를 깨우지 않는다.
      const r = root.getBoundingClientRect();
      if (ev.clientY < r.top || ev.clientY > r.bottom || ev.clientX < r.left || ev.clientX > r.right) {
        prev = null;
        return;
      }
      pointerX = ev.clientX;
      pointerY = ev.clientY;
      pointerMoved = true;
      kick();
    };

    const onScroll = () => {
      // 스크롤 중에는 멈춘 포인터 아래로 캔버스가 움직인다 — 궤적으로 보지 않는다.
      prev = null;
      pointerMoved = false;
    };

    const onVisibility = () => {
      if (document.hidden && running) {
        running = false;
        cancelAnimationFrame(rafId);
      }
    };

    const show = () => {
      if (!allocate()) return;
      resolvePalette();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
    };

    const onResize = () => {
      if (disposed || offscreen) return;
      show();
    };

    // 테마 전환(html.dark)은 CSS 변수만 뒤집는다 — 캔버스는 해석된 색을 들고 있으므로 다시 굽는다.
    const themeObserver = new MutationObserver(() => {
      if (disposed || cssW === 0) return;
      resolvePalette();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(onResize);
      ro.observe(canvas);
    } else {
      window.addEventListener('resize', onResize);
    }

    // 관찰 대상은 sticky 캔버스가 아니라 섹션 높이 컨테이너다 — 섹션이 화면에 걸쳐 있는 동안만 산다.
    const io = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => {
        offscreen = !entry.isIntersecting;
        if (offscreen) {
          running = false;
          cancelAnimationFrame(rafId);
          release();
        } else {
          show();
        }
      })
      : null;
    io?.observe(root);
    if (!io) show();

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      io?.disconnect();
      ro?.disconnect();
      themeObserver.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [salt]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      data-section-fx
      className={[
        'pointer-events-none absolute inset-0 [clip-path:inset(0)]',
        // 섹션 위아래 끝에서 점이 직선으로 끊기지 않게 서서히 지운다(히어로 배경 마스크와 같은 처리).
        '[mask-image:linear-gradient(to_bottom,transparent,#000_96px,#000_calc(100%_-_96px),transparent)]',
        // 가장 밝은 점의 불투명도. 다크는 띠(surface-container-high)와 잉크 대비가 작아 한 단계 올린다.
        '[--lamp-peak:0.75] dark:[--lamp-peak:0.95]',
      ].join(' ')}
    >
      {/* 화면 높이 캔버스가 짧은 섹션(도입문의 등) 아래로 삐져나오면 clip-path 는 그림만 자르고
          문서 높이는 늘린다 — 마지막 섹션이면 페이지 끝에 빈 스크롤이 생긴다. 섹션 높이를 넘지 않게 막는다. */}
      <canvas ref={canvasRef} className="sticky top-0 block h-[100lvh] max-h-full w-full" />
    </div>
  );
}
