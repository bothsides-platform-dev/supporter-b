import { describe, it, expect } from 'vitest';
import {
  CELL_H,
  LINE_DECAY_TAU_MS,
  LINE_DT_CLAMP_MS,
  LINE_ENERGY_EPSILON,
  LINE_PITCH,
  PACKET_CELLS,
  PACKET_COL_RATIO,
  createLineField,
  decayLineField,
  lineLayout,
  packetCellAlpha,
  packetHeadY,
  packetsFor,
  stampLineTrail,
} from '../line-field';

describe('lineLayout', () => {
  it('가운데 선이 폭의 정중앙에 놓인다', () => {
    const { offset, count } = lineLayout(1440);
    const xs = Array.from({ length: count }, (_, i) => offset + i * LINE_PITCH);
    expect(xs).toContain(720);
    expect(xs[0]).toBeGreaterThanOrEqual(0);
    expect(xs[0]).toBeLessThan(LINE_PITCH);
    expect(xs[xs.length - 1]).toBeLessThan(1440);
  });

  it('폭이 0 이하면 선이 없다', () => {
    expect(lineLayout(0)).toEqual({ offset: 0, count: 0 });
  });
});

describe('stampLineTrail', () => {
  it('커서 아래 칸이 가장 밝고 멀어질수록 약해진다', () => {
    const { offset, count } = lineLayout(560);
    const field = createLineField(count, 50);
    const x = offset + 5 * LINE_PITCH;
    const y = 20 * CELL_H + CELL_H / 2;
    stampLineTrail(field, offset, x, y, x, y);
    const at = (c: number, r: number) => field.energy[r * count + c];
    expect(at(5, 20)).toBeCloseTo(1, 5);
    expect(at(5, 23)).toBeLessThan(at(5, 21));
    expect(at(7, 20)).toBeLessThan(at(6, 20));
    // 세로로 더 길게 번진다 — 같은 거리(2)라도 열 방향이 더 빨리 식는다.
    expect(at(7, 20)).toBeLessThan(at(5, 22));
    expect(at(5, 45)).toBe(0);
    for (const i of field.active) expect(field.energy[i]).toBeLessThanOrEqual(1);
  });

  it('빠른 이동도 궤적이 끊기지 않는다', () => {
    const { offset, count } = lineLayout(840);
    const field = createLineField(count, 40);
    stampLineTrail(field, offset, offset, 100, offset + 20 * LINE_PITCH, 100);
    const row = Math.floor(100 / CELL_H);
    for (let c = 0; c <= 20; c++) expect(field.energy[row * count + c]).toBeGreaterThan(0.5);
  });
});

describe('decayLineField', () => {
  it('시간상수만큼 지나면 e^-1 로 줄고, ε 아래는 퇴출한다', () => {
    const field = createLineField(2, 1);
    field.energy[0] = 1;
    field.energy[1] = LINE_ENERGY_EPSILON * 1.01;
    field.active.add(0).add(1);
    let elapsed = 0;
    while (elapsed < LINE_DECAY_TAU_MS) {
      decayLineField(field, 20);
      elapsed += 20;
    }
    expect(field.energy[0]).toBeCloseTo(Math.exp(-1), 2);
    expect(field.active.has(1)).toBe(false);
    expect(field.energy[1]).toBe(0);
  });

  it('큰 시간 점프는 상한까지만 감쇠한다', () => {
    const field = createLineField(1, 1);
    field.energy[0] = 1;
    field.active.add(0);
    decayLineField(field, 10_000);
    expect(field.energy[0]).toBeCloseTo(Math.exp(-LINE_DT_CLAMP_MS / LINE_DECAY_TAU_MS), 5);
  });
});

describe('packets', () => {
  it('결정적이고 비율이 대략 맞으며 띠마다 배치가 다르다', () => {
    const a = packetsFor(400, 0);
    expect(packetsFor(400, 0)).toEqual(a);
    expect(a.length / 400).toBeGreaterThan(PACKET_COL_RATIO * 0.6);
    expect(a.length / 400).toBeLessThan(PACKET_COL_RATIO * 1.4);
    expect(packetsFor(400, 1).map((p) => p.col)).not.toEqual(a.map((p) => p.col));
  });

  it('스크롤에만 묶여 움직이고 화면 밖으로 나가면 반대편에서 들어온다', () => {
    const packet = { col: 0, speed: 0.5, phase: 0.25 };
    const h = 900;
    const len = PACKET_CELLS * CELL_H;
    const y0 = packetHeadY(packet, 1000, h);
    expect(packetHeadY(packet, 1000, h)).toBe(y0);
    expect(packetHeadY(packet, 1100, h) - y0).toBeCloseTo(50, 5);
    for (let s = -5000; s <= 5000; s += 137) {
      const y = packetHeadY(packet, s, h);
      expect(y).toBeGreaterThanOrEqual(-len);
      expect(y).toBeLessThan(h);
    }
  });

  it('꼬리로 갈수록 옅어진다', () => {
    expect(packetCellAlpha(0)).toBe(1);
    for (let k = 1; k < PACKET_CELLS; k++) expect(packetCellAlpha(k)).toBeLessThan(packetCellAlpha(k - 1));
    expect(packetCellAlpha(PACKET_CELLS)).toBe(0);
  });
});
