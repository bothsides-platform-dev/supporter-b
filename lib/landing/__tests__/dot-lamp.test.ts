import { describe, it, expect } from 'vitest';
import {
  DOT_PITCH,
  LAMP_DT_CLAMP_MS,
  LAMP_EPSILON,
  LAMP_MAX_LIGHTS,
  LAMP_RADIUS,
  LAMP_SAMPLE_PX,
  LAMP_TAU_MS,
  createDotGrid,
  decayLamp,
  dotSize,
  dotValue,
  lightDots,
  stampLamp,
  type Light,
} from '../dot-lamp';

describe('createDotGrid', () => {
  it('가로는 폭 가운데에 점이 오도록 맞춘다', () => {
    for (const width of [1440, 1000, 1281]) {
      const g = createDotGrid(width, 900, 0);
      const xs = Array.from({ length: g.cols }, (_, c) => g.ox + c * DOT_PITCH);
      expect(xs.some((x) => Math.abs(x - width / 2) <= 0.5)).toBe(true);
      expect(g.ox).toBeGreaterThanOrEqual(0);
      expect(g.ox).toBeLessThan(DOT_PITCH);
      expect(xs[xs.length - 1]).toBeGreaterThanOrEqual(width - DOT_PITCH);
    }
  });

  it('크기가 0 이면 빈 격자다', () => {
    const g = createDotGrid(0, 0, 0);
    expect(g.cols).toBe(0);
    expect(g.level.length).toBe(0);
  });

  it('흔들림 해시는 salt 마다 결정적으로 다르다', () => {
    const a = createDotGrid(320, 160, 1);
    const b = createDotGrid(320, 160, 1);
    const c = createDotGrid(320, 160, 2);
    expect(Array.from(a.jitter)).toEqual(Array.from(b.jitter));
    expect(Array.from(a.jitter)).not.toEqual(Array.from(c.jitter));
  });
});

describe('stampLamp', () => {
  it('새 궤적(시작점=끝점)은 빛 하나만 찍는다', () => {
    const lights: Light[] = [];
    stampLamp(lights, 50, 60, 50, 60);
    expect(lights).toEqual([{ x: 50, y: 60, e: 1 }]);
  });

  it('긴 이동은 샘플 간격 이하로 나눠 끝점까지 찍는다', () => {
    const lights: Light[] = [];
    stampLamp(lights, 0, 0, 200, 0);
    expect(lights.length).toBe(Math.ceil(200 / LAMP_SAMPLE_PX));
    expect(lights[lights.length - 1]).toMatchObject({ x: 200, y: 0 });
    for (let i = 1; i < lights.length; i++) {
      expect(lights[i].x - lights[i - 1].x).toBeLessThanOrEqual(LAMP_SAMPLE_PX);
    }
  });

  it('상한을 넘으면 오래된 빛부터 버린다', () => {
    const lights: Light[] = [];
    stampLamp(lights, 0, 0, LAMP_SAMPLE_PX * (LAMP_MAX_LIGHTS + 10), 0);
    expect(lights.length).toBe(LAMP_MAX_LIGHTS);
    expect(lights[lights.length - 1].x).toBe(LAMP_SAMPLE_PX * (LAMP_MAX_LIGHTS + 10));
  });
});

describe('decayLamp', () => {
  it('시간상수만큼 지나면 세기가 1/e 로 준다(한 번은 클램프 안쪽으로 나눠 식힌다)', () => {
    const lights: Light[] = [{ x: 0, y: 0, e: 1 }];
    let left = LAMP_TAU_MS;
    while (left > 0) {
      const dt = Math.min(left, LAMP_DT_CLAMP_MS);
      decayLamp(lights, dt);
      left -= dt;
    }
    expect(lights[0].e).toBeCloseTo(Math.exp(-1), 5);
  });

  it('긴 프레임 간격은 클램프한다', () => {
    const lights: Light[] = [{ x: 0, y: 0, e: 1 }];
    decayLamp(lights, 10_000);
    expect(lights[0].e).toBeCloseTo(Math.exp(-LAMP_DT_CLAMP_MS / LAMP_TAU_MS), 5);
  });

  it('식은 빛은 빼고, 모두 식으면 false 를 돌려준다', () => {
    const lights: Light[] = [{ x: 0, y: 0, e: 1 }, { x: 5, y: 5, e: LAMP_EPSILON * 1.01 }];
    expect(decayLamp(lights, 16)).toBe(true);
    expect(lights.length).toBe(1);
    let alive = true;
    for (let i = 0; i < 200 && alive; i++) alive = decayLamp(lights, LAMP_DT_CLAMP_MS);
    expect(alive).toBe(false);
    expect(lights.length).toBe(0);
  });
});

describe('lightDots', () => {
  it('빛이 없으면 null 이다', () => {
    expect(lightDots(createDotGrid(320, 320, 0), [])).toBeNull();
  });

  it('빛 바로 아래 점은 빛 세기, 반지름 밖 점은 0 이다', () => {
    const g = createDotGrid(640, 640, 0);
    const c = 10;
    const r = 10;
    const x = g.ox + c * DOT_PITCH;
    const y = g.oy + r * DOT_PITCH;
    const bounds = lightDots(g, [{ x, y, e: 0.8 }]);
    expect(bounds).not.toBeNull();
    expect(g.level[r * g.cols + c]).toBeCloseTo(0.8, 6);
    const far = Math.ceil(LAMP_RADIUS / DOT_PITCH) + 1;
    expect(g.level[r * g.cols + c + far]).toBe(0);
    expect(g.level[(r + far) * g.cols + c]).toBe(0);
    // 반지름 안에서는 가운데에서 멀수록 어두워진다.
    expect(g.level[r * g.cols + c + 2]).toBeLessThan(g.level[r * g.cols + c + 1]);
  });

  it('겹친 빛은 더하지 않고 센 쪽을 쓴다', () => {
    const g = createDotGrid(640, 640, 0);
    const x = g.ox + 10 * DOT_PITCH;
    const y = g.oy + 10 * DOT_PITCH;
    lightDots(g, [{ x, y, e: 0.5 }, { x, y, e: 0.5 }]);
    expect(g.level[10 * g.cols + 10]).toBeCloseTo(0.5, 6);
  });

  it('범위는 격자 안으로 자르고, 매 호출마다 이전 밝기를 지운다', () => {
    const g = createDotGrid(320, 320, 0);
    const b = lightDots(g, [{ x: 0, y: 0, e: 1 }])!;
    expect(b.c0).toBe(0);
    expect(b.r0).toBe(0);
    expect(b.c1).toBeLessThan(g.cols);
    lightDots(g, [{ x: 300, y: 300, e: 1 }]);
    expect(g.level[0]).toBe(0);
  });

  it('격자 밖 먼 빛은 범위를 만들지 않는다', () => {
    const g = createDotGrid(320, 320, 0);
    expect(lightDots(g, [{ x: -1000, y: -1000, e: 1 }])).toBeNull();
  });
});

describe('dotValue / dotSize', () => {
  it('흔들림은 밝기의 75~100% 안이다', () => {
    const g = createDotGrid(320, 320, 3);
    g.level.fill(1);
    for (let i = 0; i < g.level.length; i++) {
      const v = dotValue(g, i);
      expect(v).toBeGreaterThanOrEqual(0.75);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('밝을수록 점이 커진다', () => {
    expect(dotSize(0.1)).toBe(1);
    expect(dotSize(0.5)).toBe(2);
    expect(dotSize(0.9)).toBe(3);
  });
});
