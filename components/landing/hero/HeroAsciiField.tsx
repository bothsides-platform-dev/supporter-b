'use client';

import { useEffect, useRef } from 'react';
import { useMotionValueEvent } from 'motion/react';
import type { MotionValue } from 'motion/react';
import {
  FONT_PX,
  HUE_BUCKETS,
  PITCH,
  REST_CHAR,
  accentHash,
  charForEnergy,
  createField,
  decayField,
  hueBucket,
  hueHash,
  restAlpha,
  stampTrail,
  twinkleEnvelope,
  twinkleIndices,
  twinkleWindowIndex,
  type AsciiField,
} from '@/lib/landing/ascii-field';

// 다크 오프닝 씬 배경 — 캔버스 기반 ASCII 문자 필드 (커서 중심 미니멀).
// 필드는 거의 정적(셀 2%의 미세 twinkle만)이고, 커서 궤적을 따라 문자가 · : + * # 로
// 깨어났다가 ~2–3초에 걸쳐 잔상처럼 식는다. 잉크→inverse-primary 색 리프트 + 소프트 블룸.
// 블룸·앰비언트 글로우는 §9(블러 금지)의 사용자 승인 예외 — 랜딩 히어로 한정(§9 랜딩·마케팅
// 예외 범주). 터치 기기는 손가락 드래그(pointermove, pointerType=touch) 로 같은 궤적을
// 스탬프한다 — 동작 줄이기 선호일 때만 정적 베이스 필드로 폴백한다(루프·리스너 없음).
// 순수 계산(에너지·램프·해시)은 lib/landing/ascii-field.ts 가 소유한다.

interface HeroAsciiFieldProps {
  /** 씬 스크롤 진행 — 라이트 리빌 완료(≥ 0.9) 후 rAF 를 완전히 멈추고 복귀 시 재개한다. */
  scrollYProgress: MotionValue<number>;
}

const SCROLL_HIDE_AT = 0.9;
const DPR_CAP = 2;
// 배경 연출에 60fps 는 과잉 — 감쇠(τ=900ms) 기준 30fps 면 충분히 매끄럽다.
const FRAME_MS = 33;
// 이보다 오래 포인터가 쉬면 다음 이동은 새 궤적으로 시작(화면 재진입 시 가짜 트레일 방지).
const POINTER_IDLE_RESET_MS = 250;
// 글로우(블룸): ¼ 해상도 오프스크린에 라디얼 스프라이트를 찍고 업스케일 blit.
// 업스케일 보간 자체가 블러 역할이라 ctx.filter/shadowBlur 없이 부드럽다(Safari 안전).
const GLOW_SCALE = 0.25;
const GLOW_SPRITE_PX = 64;
const GLOW_MIN_ENERGY = 0.25;
const GLOW_SIZE_PX = PITCH * 2.6;
const GLOW_LAYER_ALPHA = 0.85;
// 에너지 → 색 리프트를 24티어 rgba 문자열로 사전계산해 프레임당 문자열 생성을 없앤다.
const COLOR_TIERS = 24;
// 셀별 색 지터 — blue 기준 채널 오프셋(0=하늘 그대로, 1=시안 편향, 2=보라 편향). "약간"이라
// 채널당 최대 이동폭을 ±18 안팎(255 기준 ~7%)으로 눈으로 튜닝해 제한한다 — 이보다 크면
// 궤적이 무지갯빛으로 튀어 §9 예외의 "은은한 반짝임" 범위를 벗어난다.
const HUE_OFFSETS: Rgb[] = [
  [0, 0, 0],
  [-18, 10, 14],
  [16, -10, 18],
];
// hueBucket()이 낼 수 있는 모든 인덱스를 커버해야 한다 — 어긋나면 tierColors[bucket] undefined.
if (HUE_OFFSETS.length !== HUE_BUCKETS) {
  throw new Error('HUE_OFFSETS must have exactly HUE_BUCKETS entries');
}

type Rgb = [number, number, number];

// 토큰 해석 실패 시 폴백(라이트 테마 리터럴). 실제 값은 mount 시 계산 스타일에서 읽는다 —
// 다크 테마에서 inverse-* 토큰이 뒤집히므로 하드코딩하면 안 된다.
const INK_FALLBACK: Rgb = [247, 248, 248]; // --md-sys-color-inverse-on-surface
const BLUE_FALLBACK: Rgb = [158, 202, 255]; // --md-sys-color-inverse-primary

// 앰비언트 워시 — "플랫 검정 금지" 요구: inverse-primary 를 아주 옅게 섞은 라디얼 2장이
// 다크 레이어에 은은한 광원 깊이를 준다. CSS 정적 배경이라 JS 비용 0.
const AMBIENT_BG = [
  'radial-gradient(1200px 800px at 50% -10%, color-mix(in srgb, var(--md-sys-color-inverse-primary) 10%, transparent), transparent 70%)',
  'radial-gradient(900px 600px at 85% 110%, color-mix(in srgb, var(--md-sys-color-inverse-primary) 6%, transparent), transparent 70%)',
].join(', ');

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
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

function clamp255(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v)));
}

// blue 에 버킷별 오프셋을 더한 지터 타깃(0~255 clamp). 테마가 뒤집혀도 항상 resolved blue 기준.
function hueTarget(blueRgb: Rgb, offset: Rgb): Rgb {
  return [
    clamp255(blueRgb[0] + offset[0]),
    clamp255(blueRgb[1] + offset[1]),
    clamp255(blueRgb[2] + offset[2]),
  ];
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function HeroAsciiField({ scrollYProgress }: HeroAsciiFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenByScrollRef = useRef(false);
  const resumeRef = useRef<(() => void) | null>(null);

  // 진행값 구독은 motion 훅으로 — 테스트의 motion/react 목(no-op 스텁)과 호환된다.
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const hidden = v >= SCROLL_HIDE_AT;
    if (hiddenByScrollRef.current === hidden) return;
    hiddenByScrollRef.current = hidden;
    if (!hidden) resumeRef.current?.();
  });

  useEffect(() => {
    // 가드 ①: matchMedia 미정의(jsdom 등) — getContext 에 닿기 전에 탈출한다.
    if (typeof window.matchMedia !== 'function') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 가드 ②: 2d 컨텍스트 없음(테스트·특수 환경).
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 가드 ③(제거됨): 랜딩 연출은 사용자의 동작 줄이기 선호를 무시하고 항상 실행한다
    // (제품 결정 — DESIGN.md §9 예외 ③). 터치 기기는 제외하지 않는다 — pointermove 는
    // 드래그 중 pointerType=touch 로도 발생하므로 기존 onPointerMove/stampTrail 경로가
    // 손가락 궤적에도 그대로 먹힌다.
    const animate = true;

    // 앵커 딥링크(#pricing 등)로 트랙 아래에서 진입하면 첫 change 이벤트 전에도 루프가 돌지
    // 않아야 한다 — HeroPinnedScene의 톤 스위치 mount-sync와 같은 패턴으로 초기값을 동기화.
    hiddenByScrollRef.current = scrollYProgress.get() >= SCROLL_HIDE_AT;

    const base = document.createElement('canvas');
    const baseCtx = base.getContext('2d');
    const glow = document.createElement('canvas');
    const glowCtx = glow.getContext('2d');
    const sprites = Array.from({ length: HUE_BUCKETS }, () => document.createElement('canvas'));
    const spriteCtxs = sprites.map((s) => s.getContext('2d'));
    if (!baseCtx || !glowCtx || spriteCtxs.some((c) => !c)) return;
    const spriteContexts = spriteCtxs as CanvasRenderingContext2D[];

    let disposed = false;
    let running = false;
    let rafId = 0;

    // 격자 상태
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let cols = 0;
    let rows = 0;
    let field: AsciiField = createField(0, 0);
    let restAlphas = new Float32Array(0);
    let accentHashes = new Float32Array(0);
    let hueBuckets = new Uint8Array(0);

    // 팔레트·폰트 (mount + 재개 시 해석)
    let ink = INK_FALLBACK;
    let blue = BLUE_FALLBACK;
    let fontString = `500 ${FONT_PX}px ui-monospace, monospace`;
    // tierColors[bucket][tier] — 버킷별 ink→hueTarget 24티어 램프.
    let tierColors: string[][] = [];

    // 타이밍·포인터
    let lastFrame = 0;
    let lastTick = 0;
    let pointerX = 0;
    let pointerY = 0;
    let pointerMoved = false;
    let prevX = 0;
    let prevY = 0;
    let hasPrev = false;
    let prevAt = 0;

    // twinkle 캐시 — 윈도우가 바뀔 때만 대상 셀을 다시 뽑는다
    let twinkleWindow = -1;
    let twinkleCells: number[] = [];

    const cellX = (i: number) => ((i % cols) + 0.5) * PITCH;
    const cellY = (i: number) => (Math.floor(i / cols) + 0.5) * PITCH;

    const resolvePalette = () => {
      const cs = getComputedStyle(canvas);
      ink = parseColor(cs.getPropertyValue('--md-sys-color-inverse-on-surface'), INK_FALLBACK);
      blue = parseColor(cs.getPropertyValue('--md-sys-color-inverse-primary'), BLUE_FALLBACK);
      // next/font 가 --font-mono 에 해시 패밀리를 넣으므로 var 값을 그대로 폰트 스택으로 쓴다.
      const family = cs.getPropertyValue('--font-mono').trim();
      fontString = `500 ${FONT_PX}px ${family || 'ui-monospace, monospace'}`;
      tierColors = HUE_OFFSETS.map((offset) => {
        const target = hueTarget(blue, offset);
        return Array.from({ length: COLOR_TIERS }, (_, t) => {
          const e = t / (COLOR_TIERS - 1);
          const mix = smoothstep(0.15, 0.75, e);
          const c: Rgb = [
            Math.round(ink[0] + (target[0] - ink[0]) * mix),
            Math.round(ink[1] + (target[1] - ink[1]) * mix),
            Math.round(ink[2] + (target[2] - ink[2]) * mix),
          ];
          return rgba(c, 0.1 + 0.85 * e);
        });
      });
      // 글로우 스프라이트(부드러운 라디얼) — 버킷별 지터 색으로 하나씩 굽는다. 팔레트가
      // 바뀌면 전부 다시 굽는다.
      const half = GLOW_SPRITE_PX / 2;
      HUE_OFFSETS.forEach((offset, b) => {
        const target = hueTarget(blue, offset);
        const s = sprites[b];
        const sc = spriteContexts[b];
        s.width = GLOW_SPRITE_PX;
        s.height = GLOW_SPRITE_PX;
        const grad = sc.createRadialGradient(half, half, 0, half, half, half);
        grad.addColorStop(0, rgba(target, 0.55));
        grad.addColorStop(1, rgba(target, 0));
        sc.clearRect(0, 0, GLOW_SPRITE_PX, GLOW_SPRITE_PX);
        sc.fillStyle = grad;
        sc.fillRect(0, 0, GLOW_SPRITE_PX, GLOW_SPRITE_PX);
      });
    };

    // 휴지 글리프 전체를 오프스크린에 프리렌더 — 매 프레임은 blit 한 번이면 된다.
    const renderBase = () => {
      base.width = cssW * dpr;
      base.height = cssH * dpr;
      baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      baseCtx.clearRect(0, 0, cssW, cssH);
      baseCtx.font = fontString;
      baseCtx.textAlign = 'center';
      baseCtx.textBaseline = 'middle';
      for (let i = 0; i < cols * rows; i++) {
        baseCtx.fillStyle = rgba(ink, restAlphas[i]);
        baseCtx.fillText(REST_CHAR, cellX(i), cellY(i));
      }
    };

    const paintStatic = () => {
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.drawImage(base, 0, 0, cssW, cssH);
    };

    const rebuildGrid = (): boolean => {
      const rect = canvas.getBoundingClientRect();
      const nextW = Math.round(rect.width);
      const nextH = Math.round(rect.height);
      if (nextW <= 0 || nextH <= 0) return false;
      cssW = nextW;
      cssH = nextH;
      dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      watchDpr();
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(cssW / PITCH);
      rows = Math.ceil(cssH / PITCH);
      field = createField(cols, rows);
      restAlphas = new Float32Array(cols * rows);
      accentHashes = new Float32Array(cols * rows);
      hueBuckets = new Uint8Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          restAlphas[i] = restAlpha(c, r);
          accentHashes[i] = accentHash(c, r);
          hueBuckets[i] = hueBucket(hueHash(c, r));
        }
      }
      glow.width = Math.max(1, Math.ceil(cssW * GLOW_SCALE));
      glow.height = Math.max(1, Math.ceil(cssH * GLOW_SCALE));
      twinkleWindow = -1;
      renderBase();
      return true;
    };

    const clearCell = (i: number) => {
      ctx.clearRect((i % cols) * PITCH, Math.floor(i / cols) * PITCH, PITCH, PITCH);
    };

    const frame = (now: number) => {
      if (disposed) return;
      if (document.hidden || hiddenByScrollRef.current) {
        // 재개는 visibilitychange / 스크롤 복귀 핸들러가 담당
        running = false;
        return;
      }
      rafId = requestAnimationFrame(frame);
      if (now - lastFrame < FRAME_MS) return;
      const dt = now - lastTick;
      lastFrame = now;
      lastTick = now;

      // 1) 포인터 궤적 스탬프 — pointermove 는 좌표만 저장하고 스탬프는 프레임당 1회
      if (pointerMoved) {
        pointerMoved = false;
        const rect = canvas.getBoundingClientRect();
        const x = pointerX - rect.left;
        const y = pointerY - rect.top;
        if (hasPrev && now - prevAt <= POINTER_IDLE_RESET_MS) {
          stampTrail(field, prevX, prevY, x, y, PITCH);
        } else {
          stampTrail(field, x, y, x, y, PITCH);
        }
        prevX = x;
        prevY = y;
        hasPrev = true;
        prevAt = now;
      }

      // 2) 잔상 감쇠
      decayField(field, dt);

      // 3) twinkle 윈도우 갱신
      const w = twinkleWindowIndex(now);
      if (w !== twinkleWindow) {
        twinkleWindow = w;
        twinkleCells = twinkleIndices(cols, rows, w);
      }
      const boost = twinkleEnvelope(now);
      const twinkleOn = boost > 0.001;

      // 4) 드로우: 베이스 blit → 갱신 셀 클리어 → 글로우(additive) → 글리프
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.drawImage(base, 0, 0, cssW, cssH);

      for (const i of field.active) clearCell(i);
      if (twinkleOn) {
        for (const i of twinkleCells) {
          if (!field.active.has(i)) clearCell(i);
        }
      }

      let anyGlow = false;
      for (const i of field.active) {
        const e = field.energy[i];
        if (e <= GLOW_MIN_ENERGY) continue;
        if (!anyGlow) {
          glowCtx.clearRect(0, 0, glow.width, glow.height);
          anyGlow = true;
        }
        const size = GLOW_SIZE_PX * GLOW_SCALE;
        glowCtx.globalAlpha = e * e * 0.5;
        glowCtx.drawImage(
          sprites[hueBuckets[i]],
          cellX(i) * GLOW_SCALE - size / 2,
          cellY(i) * GLOW_SCALE - size / 2,
          size,
          size,
        );
      }
      if (anyGlow) {
        glowCtx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = GLOW_LAYER_ALPHA;
        // 위치를 GLOW_SCALE 로 찍었으므로 정확히 그 역배율로 되돌린다(ceil 오차 방지)
        ctx.drawImage(glow, 0, 0, glow.width / GLOW_SCALE, glow.height / GLOW_SCALE);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.font = fontString;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (twinkleOn) {
        for (const i of twinkleCells) {
          if (field.active.has(i)) continue;
          ctx.fillStyle = rgba(ink, restAlphas[i] + boost);
          ctx.fillText(REST_CHAR, cellX(i), cellY(i));
        }
      }
      for (const i of field.active) {
        const e = field.energy[i];
        const tier = Math.min(COLOR_TIERS - 1, Math.floor(e * COLOR_TIERS));
        ctx.fillStyle = tierColors[hueBuckets[i]][tier];
        ctx.fillText(charForEnergy(e, accentHashes[i]), cellX(i), cellY(i));
      }
    };

    const kick = () => {
      if (disposed || !animate || running) return;
      if (document.hidden || hiddenByScrollRef.current) return;
      running = true;
      lastFrame = 0;
      lastTick = performance.now();
      hasPrev = false; // 일시정지 동안의 포인터 이동으로 가짜 트레일을 만들지 않는다
      rafId = requestAnimationFrame(frame);
    };

    const resume = () => {
      if (disposed || !animate || running) return;
      if (document.hidden || hiddenByScrollRef.current) return;
      // 일시정지 사이 테마 토글(푸터)로 토큰이 바뀌었을 수 있어 재개 시 팔레트를 재해석한다.
      resolvePalette();
      renderBase();
      kick();
    };

    const onPointerMove = (e: PointerEvent) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      pointerMoved = true;
    };

    const onVisibility = () => {
      if (document.hidden) {
        // rAF는 hidden 즉시 서스펜드되어 frame() 안의 가드가 실행되지 못한다 — 여기서
        // 명시적으로 멈춰야 복귀 시 resume()의 팔레트 재해석 경로가 실제로 탄다.
        if (running) {
          running = false;
          cancelAnimationFrame(rafId);
        }
      } else {
        resume();
      }
    };

    // 연속 RO 콜백은 rAF로 코얼레싱하고, 실제 크기·DPR 변화가 없으면 재래스터를 생략한다
    // (마운트 직후 RO 초기 콜백의 중복 렌더도 여기서 걸러진다).
    let resizeRaf = 0;
    const onResize = () => {
      if (disposed || resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        if (disposed) return;
        const rect = canvas.getBoundingClientRect();
        const nextDpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
        if (Math.round(rect.width) === cssW && Math.round(rect.height) === cssH && nextDpr === dpr) {
          return;
        }
        if (!rebuildGrid()) return;
        if (!running) paintStatic();
      });
    };

    // 모니터 간 이동 등 CSS 크기 변화 없는 DPR 변화는 RO가 못 잡는다 — 해상도 쿼리로 감지.
    let dprMql: MediaQueryList | null = null;
    const watchDpr = () => {
      dprMql?.removeEventListener?.('change', onResize);
      dprMql = window.matchMedia(`(resolution: ${dpr}dppx)`);
      dprMql.addEventListener?.('change', onResize);
    };

    // 테마 전환(html.dark 토글 — 시스템 자동 전환 포함)은 CSS 변수만 즉시 뒤집는다.
    // 캔버스는 해석된 색을 들고 있으므로 클래스 변화를 관찰해 팔레트를 다시 굽는다.
    const themeObserver = new MutationObserver(() => {
      if (disposed || cols === 0) return;
      resolvePalette();
      renderBase();
      if (!running) paintStatic();
    });

    resolvePalette();
    if (rebuildGrid()) paintStatic();

    // 폰트가 늦게 로드되면 베이스를 실제 JetBrains Mono 로 다시 굽는다.
    const repaintWithFont = () => {
      if (disposed || cols === 0) return;
      renderBase();
      if (!running) paintStatic();
    };
    document.fonts?.load?.(fontString).then(repaintWithFont).catch(() => {});
    document.fonts?.ready?.then(repaintWithFont).catch(() => {});

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(onResize);
      ro.observe(canvas);
    } else {
      window.addEventListener('resize', onResize);
    }
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    if (animate) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      document.addEventListener('visibilitychange', onVisibility);
      resumeRef.current = resume;
      kick();
    }

    return () => {
      disposed = true;
      resumeRef.current = null;
      if (rafId) cancelAnimationFrame(rafId);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      ro?.disconnect();
      themeObserver.disconnect();
      dprMql?.removeEventListener?.('change', onResize);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [scrollYProgress]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0" style={{ background: AMBIENT_BG }} />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
