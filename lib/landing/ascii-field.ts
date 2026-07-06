// 히어로 다크 씬 ASCII 필드의 순수 코어 — DOM 없이 셀 격자·에너지·문자 램프만 다룬다.
// 캔버스 렌더링은 components/landing/hero/HeroAsciiField.tsx 가 소유한다.
//
// 결정성: 모든 무작위성은 (col, row, salt) 정수 해시에서 나온다(Math.random 금지).
// 같은 셀은 언제나 같은 값을 얻으므로 프레임 간 깜빡임이 없고 테스트가 결정적이다.

/** 셀 피치(px). 기존 도트 그리드(26px)의 리듬을 계승한다. */
export const PITCH = 26;
/** 글리프 크기(px). */
export const FONT_PX = 13;
/** 에너지 지수 감쇠 시간상수(ms). 체감 잔상 ≈ τ·ln(1/ε) ≈ 1s. */
export const DECAY_TAU_MS = 300;
/** 이 미만으로 식은 에너지는 0으로 스냅하고 active 집합에서 퇴출한다. */
export const ENERGY_EPSILON = 0.02;
/** 감쇠 dt 상한(ms) — 탭 복귀 등 큰 시간 점프에서 잔상이 한 번에 다 식지 않게. */
export const DECAY_DT_CLAMP_MS = 100;
/** 궤적 보간 간격(px). 포인터 샘플 사이를 이 간격으로 찍어 빠른 이동에도 트레일이 안 끊긴다. */
export const TRAIL_STEP_PX = PITCH * 0.75;
/** 궤적 스탬프의 가우시안 반경(셀 단위). */
export const TRAIL_SIGMA_CELLS = 1.1;
/** 스탬프가 훑는 링 반경(셀). */
export const TRAIL_SCAN_CELLS = 3;
/** 휴지 셀 알파 — 셀별 해시로 [MIN, MIN+SPAN) 에 고정되는 미세 질감. */
export const REST_ALPHA_MIN = 0.06;
export const REST_ALPHA_SPAN = 0.08;
/** twinkle: 윈도우(4s)마다 셀 ~2%가 sin 엔벨로프로 +0.06 알파만큼 숨쉰다. */
export const TWINKLE_WINDOW_MS = 4000;
export const TWINKLE_CELL_RATIO = 0.02;
export const TWINKLE_ALPHA_BOOST = 0.06;

/** 휴지 상태 글리프. */
export const REST_CHAR = '·';

// 에너지 → 문자 램프 경계 (· : + * #)
const RAMP_T1 = 0.15;
const RAMP_T2 = 0.35;
const RAMP_T3 = 0.55;
const RAMP_T4 = 0.8;
// 피크(#) 티어에서만 드물게 제품 글리프(₩·%)가 대신 나타나는 정적 해시 슬롯.
const ACCENT_WON_SLOT = 0.06;
const ACCENT_PCT_SLOT = 0.12;

export interface AsciiField {
  cols: number;
  rows: number;
  /** 셀 에너지 0~1 (row-major). */
  energy: Float32Array;
  /** energy ≥ ε 인 셀 인덱스 — 감쇠·드로우를 O(활성 셀)로 만든다. */
  active: Set<number>;
}

export function createField(cols: number, rows: number): AsciiField {
  return { cols, rows, energy: new Float32Array(cols * rows), active: new Set() };
}

/** (col, row, salt) → [0, 1) 결정적 해시. 정수 믹싱(imul·xorshift)만 사용한다. */
export function hashCell(col: number, row: number, salt = 0): number {
  let h = Math.imul(col + 0x9e37, 0x9e3779b1);
  h ^= Math.imul(row + 0x85eb, 0x85ebca6b);
  h ^= Math.imul(salt + 0xc2b2, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** 셀별 휴지 알파. */
export function restAlpha(col: number, row: number): number {
  return REST_ALPHA_MIN + hashCell(col, row, 1) * REST_ALPHA_SPAN;
}

/** 피크 글리프 선택용 정적 해시 — restAlpha 와 salt 를 달리해 상관을 끊는다. */
export function accentHash(col: number, row: number): number {
  return hashCell(col, row, 7);
}

/** 셀별 색 지터 버킷 수 — 0=하늘(기준) 1=시안 편향 2=보라 편향. */
export const HUE_BUCKETS = 3;

/** 셀별 색 지터 선택용 정적 해시 — accentHash 와 salt 를 달리해 상관을 끊는다. */
export function hueHash(col: number, row: number): number {
  return hashCell(col, row, 11);
}

/** [0,1) 해시값 → 색 지터 버킷. */
export function hueBucket(hash: number): number {
  return Math.min(HUE_BUCKETS - 1, Math.floor(hash * HUE_BUCKETS));
}

/** 에너지 → 글리프. 해시가 정적이라 한 잔상 동안 글리프가 바뀌지 않는다(깜빡임 없음). */
export function charForEnergy(e: number, staticHash: number): string {
  if (e >= RAMP_T4) {
    if (staticHash < ACCENT_WON_SLOT) return '₩';
    if (staticHash < ACCENT_PCT_SLOT) return '%';
    return '#';
  }
  if (e >= RAMP_T3) return '*';
  if (e >= RAMP_T2) return '+';
  if (e >= RAMP_T1) return ':';
  return REST_CHAR;
}

/** 활성 셀 에너지를 지수 감쇠시키고 ε 미만은 퇴출한다. */
export function decayField(field: AsciiField, dtMs: number): void {
  const dt = Math.min(dtMs, DECAY_DT_CLAMP_MS);
  if (dt <= 0 || field.active.size === 0) return;
  const k = Math.exp(-dt / DECAY_TAU_MS);
  // Set 은 순회 중 현재 원소 삭제가 안전하다.
  for (const i of field.active) {
    const next = field.energy[i] * k;
    if (next < ENERGY_EPSILON) {
      field.energy[i] = 0;
      field.active.delete(i);
    } else {
      field.energy[i] = next;
    }
  }
}

/** 한 점 주변 셀에 가우시안 에너지를 찍는다. 좌표는 캔버스 CSS px. */
function stampPoint(field: AsciiField, x: number, y: number, pitch: number): void {
  // 셀 중심(=(c+0.5)·pitch) 기준 좌표로 환산
  const cx = x / pitch - 0.5;
  const cy = y / pitch - 0.5;
  const c0 = Math.round(cx);
  const r0 = Math.round(cy);
  const twoSigma2 = 2 * TRAIL_SIGMA_CELLS * TRAIL_SIGMA_CELLS;
  for (let r = r0 - TRAIL_SCAN_CELLS; r <= r0 + TRAIL_SCAN_CELLS; r++) {
    if (r < 0 || r >= field.rows) continue;
    for (let c = c0 - TRAIL_SCAN_CELLS; c <= c0 + TRAIL_SCAN_CELLS; c++) {
      if (c < 0 || c >= field.cols) continue;
      const add = Math.exp(-((c - cx) ** 2 + (r - cy) ** 2) / twoSigma2);
      if (add < 0.01) continue;
      const i = r * field.cols + c;
      const next = Math.min(1, field.energy[i] + add);
      if (next < ENERGY_EPSILON) continue;
      field.energy[i] = next;
      field.active.add(i);
    }
  }
}

/** 포인터 이동 구간을 TRAIL_STEP_PX 간격으로 보간해 연속 궤적을 남긴다. */
export function stampTrail(
  field: AsciiField,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  pitch: number,
): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / TRAIL_STEP_PX));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    stampPoint(field, fromX + dx * t, fromY + dy * t, pitch);
  }
}

/** timeMs 가 속한 twinkle 윈도우 인덱스. */
export function twinkleWindowIndex(timeMs: number): number {
  return Math.floor(timeMs / TWINKLE_WINDOW_MS);
}

/** 윈도우 경계에서 0이 되는 sin 엔벨로프 — 대상 셀 교체가 이음매 없이 일어난다. */
export function twinkleEnvelope(timeMs: number): number {
  const progress =
    (timeMs - twinkleWindowIndex(timeMs) * TWINKLE_WINDOW_MS) / TWINKLE_WINDOW_MS;
  return Math.sin(Math.PI * progress) * TWINKLE_ALPHA_BOOST;
}

/** 이 윈도우에 숨쉬는 셀 인덱스(전체의 ~2%). 윈도우가 바뀔 때만 재계산하면 된다. */
export function twinkleIndices(cols: number, rows: number, windowIdx: number): number[] {
  const out: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (hashCell(c, r, windowIdx + 2) < TWINKLE_CELL_RATIO) out.push(r * cols + c);
    }
  }
  return out;
}
