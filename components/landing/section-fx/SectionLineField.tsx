'use client';

import { useEffect, useRef } from 'react';
import {
  CELL_H,
  LINE_PITCH,
  PACKET_CELLS,
  createLineField,
  decayLineField,
  lineLayout,
  packetCellAlpha,
  packetHeadY,
  packetsFor,
  stampLineTrail,
  type LineField,
  type Packet,
} from '@/lib/landing/line-field';

// 랜딩 띠 섹션 배경 — Neon 식 세로 헤어라인 필드(2026-11-24 사용자 지정: Neon·Railway 참고,
// 커서·스크롤 반응, 다크에서도 보이게).
//  · 휴지: 28px 간격 세로선이 옅게 깔린다(농도는 테마별 CSS 변수 --line-base).
//  · 커서: 포인터가 지나간 선의 칸이 primary 쪽으로 밝아졌다가 약 0.4초 시간상수로 식는다.
//  · 스크롤: 일부 선을 따라 짧은 패킷이 스크롤 양만큼만 흐른다(Railway 의 입자 흐름).
//    스크롤을 멈추면 패킷도 멈추고 루프가 쉰다.
// 블러·그림자·가산 합성 없이 1~2px 사각형만 그린다 — §9 의 글로우 금지 범위 밖이다.
// 캔버스는 섹션 높이가 아니라 화면 높이(sticky)로만 잡아 긴 섹션에서도 메모리를 늘리지 않고,
// 화면 밖이면 루프를 멈추고 캔버스 메모리를 비운다. 순수 계산은 lib/landing/line-field.ts.

const DPR_CAP = 2;
const FRAME_MS = 33;
const COLOR_TIERS = 16;
/** 마지막 스크롤 뒤 이 시간 동안은 패킷을 위해 루프를 유지한다. */
const SCROLL_IDLE_MS = 180;
/** 에너지가 이 이상이면 선을 2px 로 굵혀 픽셀 막대처럼 보이게 한다. */
const THICK_ENERGY = 0.45;

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

function parseAlpha(raw: string, fallback: number): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

function rgba([r, g, b]: Rgb, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function SectionLineField({ salt = 0 }: { salt?: number }) {
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
    let offscreen = typeof IntersectionObserver !== 'function' ? false : true;
    let running = false;
    let rafId = 0;
    let lastFrame = 0;
    let lastTick = 0;
    let lastScrollAt = -Infinity;
    let scrollDir = 1;
    let lastScrollY = window.scrollY;

    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let offset = 0;
    let field: LineField = createLineField(0, 0);
    let packets: Packet[] = [];

    let ink = INK_FALLBACK;
    let accent = ACCENT_FALLBACK;
    let baseAlpha = 0.07;
    let peakAlpha = 0.7;
    let baseStyle = rgba(ink, baseAlpha);
    let tierStyles: string[] = [];
    let packetStyles: string[] = [];

    let lastPointer: { x: number; y: number } | null = null;

    const resolvePalette = () => {
      const cs = getComputedStyle(root);
      ink = parseColor(cs.getPropertyValue('--md-sys-color-on-surface'), INK_FALLBACK);
      accent = parseColor(cs.getPropertyValue('--md-sys-color-primary'), ACCENT_FALLBACK);
      baseAlpha = parseAlpha(cs.getPropertyValue('--line-base'), 0.07);
      peakAlpha = parseAlpha(cs.getPropertyValue('--line-peak'), 0.7);
      baseStyle = rgba(ink, baseAlpha);
      tierStyles = Array.from({ length: COLOR_TIERS }, (_, t) => {
        const e = (t + 1) / COLOR_TIERS;
        // 약한 에너지는 선 색(잉크) 그대로 진해지고, 강할수록 primary 로 넘어간다.
        const hue = Math.min(1, Math.max(0, (e - 0.2) / 0.6));
        return rgba(mix(ink, accent, hue), baseAlpha + (peakAlpha - baseAlpha) * e);
      });
      packetStyles = Array.from({ length: PACKET_CELLS }, (_, k) =>
        rgba(accent, peakAlpha * packetCellAlpha(k)),
      );
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
      const layout = lineLayout(w);
      offset = layout.offset;
      field = createLineField(layout.count, Math.ceil(h / CELL_H));
      packets = packetsFor(layout.count, salt);
      return true;
    };

    // 화면 밖이면 캔버스 메모리를 돌려준다(띠 4곳 × 화면 크기 × DPR² 를 계속 들고 있지 않게).
    const release = () => {
      canvas.width = 1;
      canvas.height = 1;
      cssW = 0;
      cssH = 0;
      field = createLineField(0, 0);
      packets = [];
      lastPointer = null;
    };

    const draw = () => {
      if (cssW === 0) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      const { cols, energy, active } = field;

      ctx.fillStyle = baseStyle;
      for (let c = 0; c < cols; c++) ctx.fillRect(offset + c * LINE_PITCH, 0, 1, cssH);

      for (const i of active) {
        const e = energy[i];
        const c = i % cols;
        const r = (i - c) / cols;
        ctx.fillStyle = tierStyles[Math.min(COLOR_TIERS - 1, Math.floor(e * COLOR_TIERS))];
        const w = e >= THICK_ENERGY ? 2 : 1;
        ctx.fillRect(offset + c * LINE_PITCH, r * CELL_H + 1, w, CELL_H - 2);
      }

      const scrollY = window.scrollY;
      for (const p of packets) {
        const head = packetHeadY(p, scrollY, cssH);
        const x = offset + p.col * LINE_PITCH;
        for (let k = 0; k < PACKET_CELLS; k++) {
          // 꼬리는 진행 방향 반대쪽에 남는다.
          const y = head - scrollDir * k * CELL_H;
          if (y < -CELL_H || y > cssH) continue;
          ctx.fillStyle = packetStyles[k];
          ctx.fillRect(x, y + 1, 2, CELL_H - 2);
        }
      }
    };

    const frame = (now: number) => {
      if (disposed) return;
      if (document.hidden || offscreen) {
        running = false;
        return;
      }
      if (now - lastFrame < FRAME_MS) {
        rafId = requestAnimationFrame(frame);
        return;
      }
      lastFrame = now;
      decayLineField(field, now - lastTick);
      lastTick = now;
      draw();
      // 식을 잔상도, 최근 스크롤도 없으면 마지막 프레임을 남기고 쉰다.
      if (field.active.size > 0 || now - lastScrollAt < SCROLL_IDLE_MS) {
        rafId = requestAnimationFrame(frame);
      } else {
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
      if (offscreen || cssW === 0) return;
      const rootRect = root.getBoundingClientRect();
      if (ev.clientY < rootRect.top || ev.clientY > rootRect.bottom) {
        lastPointer = null;
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const from = lastPointer ?? { x, y };
      stampLineTrail(field, offset, from.x, from.y, x, y);
      lastPointer = { x, y };
      kick();
    };

    const onScroll = () => {
      const y = window.scrollY;
      if (y !== lastScrollY) scrollDir = y > lastScrollY ? 1 : -1;
      lastScrollY = y;
      lastScrollAt = performance.now();
      // 스크롤 중에는 캔버스와 포인터의 상대 위치가 바뀌므로 궤적을 새로 시작한다.
      lastPointer = null;
      kick();
    };

    const onVisibility = () => {
      if (!document.hidden) kick();
    };

    const show = () => {
      if (!allocate()) return;
      resolvePalette();
      draw();
    };

    const onResize = () => {
      if (disposed || offscreen) return;
      show();
    };

    const themeObserver = new MutationObserver(() => {
      if (disposed || cssW === 0) return;
      resolvePalette();
      draw();
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
      data-section-line-field
      className={[
        'pointer-events-none absolute inset-0 [clip-path:inset(0)]',
        // 섹션 위아래 끝에서 선이 직선으로 끊기지 않게 서서히 지운다(히어로 배경 마스크와 같은 처리).
        '[mask-image:linear-gradient(to_bottom,transparent,#000_96px,#000_calc(100%_-_96px),transparent)]',
        // 테마별 농도. 다크는 띠(surface-container-high)와 잉크 대비가 작아 휴지·피크를 모두 올린다.
        '[--line-base:0.075] [--line-peak:0.7] dark:[--line-base:0.11] dark:[--line-peak:0.9]',
      ].join(' ')}
    >
      <canvas ref={canvasRef} className="sticky top-0 block h-[100lvh] w-full" />
    </div>
  );
}
