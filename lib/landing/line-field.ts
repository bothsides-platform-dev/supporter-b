// 랜딩 섹션 라인 필드의 순수 코어 — DOM 없이 세로 헤어라인 열, 커서 에너지 칸, 스크롤 패킷만 다룬다.
// 캔버스 렌더링은 components/landing/section-fx/SectionLineField.tsx 가 소유한다.
//
// 참고(2026-11-24 사용자 지정): Neon 의 세로 줄무늬 필드 + Railway 의 서비스 사이 입자 흐름.
// 결정성: 무작위성은 ascii-field 의 정수 해시(hashCell)에서만 나온다(Math.random 금지).

import { hashCell } from './ascii-field';

/** 세로선 간격(px). 히어로 ASCII 피치(26px)보다 약간 넓혀 글자 격자와 겹쳐 보이지 않게 한다. */
export const LINE_PITCH = 28;
/** 에너지 칸 높이(px). 칸 사이 1px 틈이 Neon 식 픽셀 막대 질감을 만든다. */
export const CELL_H = 8;
/** 커서 에너지 지수 감쇠 시간상수(ms). 히어로(500ms)보다 조금 빨리 식혀 읽기 구간을 오래 가리지 않는다. */
export const LINE_DECAY_TAU_MS = 420;
/** 이 미만으로 식은 에너지는 0으로 스냅하고 active 집합에서 퇴출한다. */
export const LINE_ENERGY_EPSILON = 0.03;
/** 감쇠 dt 상한(ms) — 탭 복귀 등 큰 시간 점프에서 잔상이 한 번에 다 식지 않게. */
export const LINE_DT_CLAMP_MS = 100;
/** 궤적 보간 간격(px). */
export const LINE_TRAIL_STEP_PX = 12;
/** 스탬프 가우시안 반경 — 가로(열)는 좁게, 세로(칸)는 길게 퍼져 선을 따라 번지는 모양. */
export const LINE_SIGMA_COLS = 1.1;
export const LINE_SIGMA_ROWS = 3.5;
/** 스탬프가 훑는 범위(열·칸). */
export const LINE_SCAN_COLS = 3;
export const LINE_SCAN_ROWS = 9;
/** 패킷을 싣는 열 비율. */
export const PACKET_COL_RATIO = 0.16;
/** 패킷 길이(칸). 머리가 가장 진하고 꼬리로 갈수록 옅어진다. */
export const PACKET_CELLS = 6;
/** 패킷 속도 — 스크롤 1px 당 캔버스 안에서 움직이는 px. 열마다 달라 깊이감(패럴랙스)을 만든다. */
export const PACKET_SPEED_MIN = 0.35;
export const PACKET_SPEED_SPAN = 0.9;

export interface LineField {
  cols: number;
  rows: number;
  /** 칸 에너지 0~1 (row-major). */
  energy: Float32Array;
  /** energy ≥ ε 인 칸 인덱스 — 감쇠·드로우를 O(활성 칸)으로 만든다. */
  active: Set<number>;
}

export function createLineField(cols: number, rows: number): LineField {
  return { cols, rows, energy: new Float32Array(cols * rows), active: new Set() };
}

/**
 * 캔버스 폭에 놓일 세로선 배치. 가운데 정렬이라 폭이 같은 띠끼리는 선이 같은 x 에 놓인다.
 * @returns offset — 첫 선의 x(px), count — 선 개수
 */
export function lineLayout(width: number): { offset: number; count: number } {
  if (width <= 0) return { offset: 0, count: 0 };
  const offset = Math.round(((width / 2) % LINE_PITCH + LINE_PITCH) % LINE_PITCH);
  const count = Math.floor((width - 1 - offset) / LINE_PITCH) + 1;
  return { offset, count: Math.max(0, count) };
}

/** 두 포인터 샘플 사이 궤적을 따라 에너지를 찍는다. 좌표는 캔버스 CSS px. */
export function stampLineTrail(
  field: LineField,
  offset: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const { cols, rows, energy, active } = field;
  if (cols === 0 || rows === 0) return;
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / LINE_TRAIL_STEP_PX));
  const inv2sc = 1 / (2 * LINE_SIGMA_COLS * LINE_SIGMA_COLS);
  const inv2sr = 1 / (2 * LINE_SIGMA_ROWS * LINE_SIGMA_ROWS);
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const col = (x0 + (x1 - x0) * t - offset) / LINE_PITCH;
    const row = (y0 + (y1 - y0) * t) / CELL_H;
    const c0 = Math.max(0, Math.round(col) - LINE_SCAN_COLS);
    const c1 = Math.min(cols - 1, Math.round(col) + LINE_SCAN_COLS);
    const r0 = Math.max(0, Math.floor(row) - LINE_SCAN_ROWS);
    const r1 = Math.min(rows - 1, Math.floor(row) + LINE_SCAN_ROWS);
    for (let c = c0; c <= c1; c++) {
      const dc = c - col;
      const wc = dc * dc * inv2sc;
      for (let r = r0; r <= r1; r++) {
        const dr = r + 0.5 - row;
        const e = Math.exp(-(wc + dr * dr * inv2sr));
        if (e < LINE_ENERGY_EPSILON) continue;
        const i = r * cols + c;
        if (e > energy[i]) {
          energy[i] = e;
          active.add(i);
        }
      }
    }
  }
}

/** 활성 칸 에너지를 지수 감쇠시키고 ε 미만은 퇴출한다. */
export function decayLineField(field: LineField, dtMs: number): void {
  const dt = Math.min(dtMs, LINE_DT_CLAMP_MS);
  if (dt <= 0 || field.active.size === 0) return;
  const k = Math.exp(-dt / LINE_DECAY_TAU_MS);
  for (const i of field.active) {
    const next = field.energy[i] * k;
    if (next < LINE_ENERGY_EPSILON) {
      field.energy[i] = 0;
      field.active.delete(i);
    } else {
      field.energy[i] = next;
    }
  }
}

export interface Packet {
  /** 캔버스 안 선 인덱스. */
  col: number;
  /** 스크롤 1px 당 이동 px. */
  speed: number;
  /** 0~1 시작 위상. */
  phase: number;
}

/** 패킷을 실을 열을 고른다. salt 로 띠마다 다른 배치를 준다. */
export function packetsFor(count: number, salt: number): Packet[] {
  const packets: Packet[] = [];
  for (let col = 0; col < count; col++) {
    if (hashCell(col, 0, 101 + salt) >= PACKET_COL_RATIO) continue;
    packets.push({
      col,
      speed: PACKET_SPEED_MIN + hashCell(col, 1, 103 + salt) * PACKET_SPEED_SPAN,
      phase: hashCell(col, 2, 107 + salt),
    });
  }
  return packets;
}

/**
 * 패킷 머리의 y(px). 스크롤에만 묶여 있어 스크롤을 멈추면 패킷도 멈춘다.
 * 범위는 [-길이, height) 이고, 화면 밖으로 나가면 반대편에서 다시 들어온다.
 */
export function packetHeadY(packet: Packet, scrollY: number, height: number): number {
  const len = PACKET_CELLS * CELL_H;
  const travel = height + len;
  if (travel <= 0) return -len;
  const pos = (packet.phase * travel + scrollY * packet.speed) % travel;
  return ((pos + travel) % travel) - len;
}

/** 패킷 k 번째 칸(0=머리)의 상대 농도. */
export function packetCellAlpha(k: number): number {
  if (k < 0 || k >= PACKET_CELLS) return 0;
  return (1 - k / PACKET_CELLS) ** 1.6;
}
