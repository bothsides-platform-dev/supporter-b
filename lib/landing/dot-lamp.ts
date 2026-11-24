// 랜딩 섹션 배경 "점 격자 손전등"의 순수 계산(2026-11-24 사용자 선택: 호버 시안 B).
// 숨은 16px 점 격자 위에서 포인터가 손전등처럼 주변 점을 드러낸다. 포인터 궤적을 따라 빛(light)을
// 찍고, 빛은 지수 감쇠로 식는다. 각 점의 밝기는 그 점을 비추는 빛 중 가장 센 값이다.
// 그리기·DOM 은 components/landing/section-fx/SectionDotLamp.tsx 가 맡는다.

import { hashCell } from './ascii-field';

/** 점 격자 간격(px). */
export const DOT_PITCH = 16;
/** 빛 하나가 닿는 반지름(px). */
export const LAMP_RADIUS = 130;
/** 빛 감쇠 시간상수(ms). */
export const LAMP_TAU_MS = 450;
/** 궤적 위에 빛을 찍는 최대 간격(px). */
export const LAMP_SAMPLE_PX = 22;
/** 동시에 들고 있는 빛 수 상한 — 넘치면 가장 오래된 빛부터 버린다. */
export const LAMP_MAX_LIGHTS = 40;
/** 이 밝기 미만은 꺼진 것으로 본다. */
export const LAMP_EPSILON = 0.02;
/** 탭 복귀 등으로 프레임 간격이 길어져도 한 번에 이만큼만 식힌다. */
export const LAMP_DT_CLAMP_MS = 100;

export interface Light {
  x: number;
  y: number;
  /** 남은 세기 0~1. */
  e: number;
}

export interface DotGrid {
  cols: number;
  rows: number;
  /** 첫 열·첫 행 점의 좌표(px). 가로는 폭 가운데 정렬이라 같은 폭의 섹션끼리 점이 같은 x 에 놓인다. */
  ox: number;
  oy: number;
  /** 이번 프레임의 점 밝기 0~1 (row-major). */
  level: Float32Array;
  /** 점마다 고정된 0~1 해시 — 손전등 가장자리가 완전한 원으로 읽히지 않게 흔든다. */
  jitter: Float32Array;
}

export interface LitBounds {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

export function createDotGrid(width: number, height: number, salt: number): DotGrid {
  if (width <= 0 || height <= 0) {
    return { cols: 0, rows: 0, ox: 0, oy: 0, level: new Float32Array(0), jitter: new Float32Array(0) };
  }
  const cols = Math.ceil(width / DOT_PITCH) + 1;
  const rows = Math.ceil(height / DOT_PITCH) + 1;
  const ox = Math.round(((width / 2) % DOT_PITCH + DOT_PITCH) % DOT_PITCH);
  const oy = DOT_PITCH / 2;
  const jitter = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) jitter[r * cols + c] = hashCell(c, r, 200 + salt);
  }
  return { cols, rows, ox, oy, level: new Float32Array(cols * rows), jitter };
}

/** 두 포인터 샘플 사이에 빛을 찍는다. 시작점이 같으면(새 궤적) 한 점만 찍는다. 좌표는 캔버스 CSS px. */
export function stampLamp(lights: Light[], x0: number, y0: number, x1: number, y1: number): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / LAMP_SAMPLE_PX));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    lights.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, e: 1 });
  }
  if (lights.length > LAMP_MAX_LIGHTS) lights.splice(0, lights.length - LAMP_MAX_LIGHTS);
}

/** 빛을 지수 감쇠시키고 ε 미만은 배열에서 뺀다. 남은 빛이 있으면 true. */
export function decayLamp(lights: Light[], dtMs: number): boolean {
  const dt = Math.min(Math.max(0, dtMs), LAMP_DT_CLAMP_MS);
  const k = Math.exp(-dt / LAMP_TAU_MS);
  let w = 0;
  for (const l of lights) {
    l.e *= k;
    if (l.e >= LAMP_EPSILON) lights[w++] = l;
  }
  lights.length = w;
  return w > 0;
}

/**
 * 빛이 닿는 점의 밝기를 grid.level 에 채우고, 밝기가 있을 수 있는 칸 범위를 돌려준다.
 * 빛이 없으면 null. 밝기는 (1 - d²/R²)² × 빛 세기의 최댓값이다.
 */
export function lightDots(grid: DotGrid, lights: readonly Light[]): LitBounds | null {
  const { cols, rows, ox, oy, level } = grid;
  if (cols === 0 || lights.length === 0) return null;
  level.fill(0);
  const r2 = LAMP_RADIUS * LAMP_RADIUS;
  let c0 = cols;
  let c1 = -1;
  let r0 = rows;
  let r1 = -1;
  for (const l of lights) {
    const lc0 = Math.max(0, Math.floor((l.x - LAMP_RADIUS - ox) / DOT_PITCH));
    const lc1 = Math.min(cols - 1, Math.ceil((l.x + LAMP_RADIUS - ox) / DOT_PITCH));
    const lr0 = Math.max(0, Math.floor((l.y - LAMP_RADIUS - oy) / DOT_PITCH));
    const lr1 = Math.min(rows - 1, Math.ceil((l.y + LAMP_RADIUS - oy) / DOT_PITCH));
    if (lc0 > lc1 || lr0 > lr1) continue;
    if (lc0 < c0) c0 = lc0;
    if (lc1 > c1) c1 = lc1;
    if (lr0 < r0) r0 = lr0;
    if (lr1 > r1) r1 = lr1;
    for (let r = lr0; r <= lr1; r++) {
      const dy = oy + r * DOT_PITCH - l.y;
      for (let c = lc0; c <= lc1; c++) {
        const dx = ox + c * DOT_PITCH - l.x;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const f = 1 - d2 / r2;
        const v = f * f * l.e;
        const i = r * cols + c;
        if (v > level[i]) level[i] = v;
      }
    }
  }
  return c1 < 0 ? null : { c0, c1, r0, r1 };
}

/** 그릴 밝기 — 점마다 고정 해시로 25% 안에서 흔든다. */
export function dotValue(grid: DotGrid, i: number): number {
  return grid.level[i] * (0.75 + 0.25 * grid.jitter[i]);
}

/** 밝기별 점 크기(px). 가운데 점일수록 커져 작은 사각이 된다. */
export function dotSize(v: number): 1 | 2 | 3 {
  return v > 0.7 ? 3 : v > 0.4 ? 2 : 1;
}
