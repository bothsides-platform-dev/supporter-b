import { describe, it, expect } from 'vitest';
import {
  DECAY_DT_CLAMP_MS,
  DECAY_TAU_MS,
  ENERGY_EPSILON,
  HUE_BUCKETS,
  PITCH,
  REST_ALPHA_MIN,
  REST_ALPHA_SPAN,
  TWINKLE_WINDOW_MS,
  accentHash,
  charForEnergy,
  createField,
  decayField,
  hashCell,
  hueBucket,
  hueHash,
  restAlpha,
  stampTrail,
  twinkleEnvelope,
  twinkleIndices,
} from '../ascii-field';

describe('hashCell', () => {
  it('결정적이고 [0, 1) 범위다', () => {
    expect(hashCell(3, 7, 1)).toBe(hashCell(3, 7, 1));
    for (let c = 0; c < 20; c++) {
      for (let r = 0; r < 20; r++) {
        const h = hashCell(c, r, 0);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
      }
    }
  });

  it('셀·salt 가 다르면 값이 달라진다(스폿 체크)', () => {
    expect(hashCell(0, 0, 0)).not.toBe(hashCell(1, 0, 0));
    expect(hashCell(0, 0, 0)).not.toBe(hashCell(0, 1, 0));
    expect(hashCell(0, 0, 0)).not.toBe(hashCell(0, 0, 1));
  });
});

describe('charForEnergy', () => {
  it('에너지 램프 경계를 따른다 (· : + * #)', () => {
    expect(charForEnergy(0, 0.5)).toBe('·');
    expect(charForEnergy(0.14, 0.5)).toBe('·');
    expect(charForEnergy(0.15, 0.5)).toBe(':');
    expect(charForEnergy(0.35, 0.5)).toBe('+');
    expect(charForEnergy(0.55, 0.5)).toBe('*');
    expect(charForEnergy(0.8, 0.5)).toBe('#');
    expect(charForEnergy(1, 0.5)).toBe('#');
  });

  it('피크 티어에서만 정적 해시 슬롯이 ₩·% 를 고른다', () => {
    expect(charForEnergy(1, 0.03)).toBe('₩');
    expect(charForEnergy(1, 0.08)).toBe('%');
    expect(charForEnergy(1, 0.2)).toBe('#');
    // 피크 아래에선 해시와 무관하게 램프 문자
    expect(charForEnergy(0.7, 0.03)).toBe('*');
  });
});

describe('decayField', () => {
  it('τ·ln2 만큼 감쇠하면 에너지가 절반이 된다', () => {
    const f = createField(4, 4);
    f.energy[5] = 1;
    f.active.add(5);
    // dt 클램프(100ms) 안쪽으로 나눠서 총 τ·ln2 만큼 감쇠 (지수는 합성 가능)
    let remain = DECAY_TAU_MS * Math.LN2;
    while (remain > 0) {
      const step = Math.min(remain, DECAY_DT_CLAMP_MS);
      decayField(f, step);
      remain -= step;
    }
    expect(f.energy[5]).toBeCloseTo(0.5, 2);
    expect(f.active.has(5)).toBe(true);
  });

  it('ε 미만은 0으로 스냅하고 active 에서 퇴출한다', () => {
    const f = createField(2, 2);
    f.energy[0] = ENERGY_EPSILON * 1.01;
    f.active.add(0);
    decayField(f, DECAY_DT_CLAMP_MS);
    expect(f.energy[0]).toBe(0);
    expect(f.active.has(0)).toBe(false);
  });

  it('큰 시간 점프는 dt 클램프로 잘려 한 번에 다 식지 않는다', () => {
    const a = createField(1, 1);
    a.energy[0] = 1;
    a.active.add(0);
    const b = createField(1, 1);
    b.energy[0] = 1;
    b.active.add(0);
    decayField(a, 1_000_000);
    decayField(b, DECAY_DT_CLAMP_MS);
    expect(a.energy[0]).toBe(b.energy[0]);
  });
});

describe('stampTrail', () => {
  it('빠른 두 점 이동도 경로의 모든 셀에 갭 없이 에너지를 남긴다', () => {
    const f = createField(20, 3);
    const y = PITCH * 1.5; // row 1 의 셀 중심 높이
    stampTrail(f, PITCH * 0.5, y, PITCH * 15.5, y, PITCH); // col 0 중심 → col 15 중심
    for (let c = 0; c <= 15; c++) {
      const i = 1 * 20 + c;
      expect(f.energy[i]).toBeGreaterThan(0.5);
      expect(f.active.has(i)).toBe(true);
    }
  });

  it('격자 밖 좌표도 안전하게 처리한다', () => {
    const f = createField(4, 4);
    expect(() => stampTrail(f, -500, -500, 5000, 5000, PITCH)).not.toThrow();
  });
});

describe('twinkle', () => {
  it('엔벨로프는 윈도우 경계에서 0이다', () => {
    expect(twinkleEnvelope(0)).toBeCloseTo(0, 6);
    expect(twinkleEnvelope(TWINKLE_WINDOW_MS)).toBeCloseTo(0, 6);
    expect(twinkleEnvelope(TWINKLE_WINDOW_MS / 2)).toBeGreaterThan(0);
  });

  it('윈도우별 대상 셀은 결정적이고 비율이 ~2% 근처다', () => {
    const a = twinkleIndices(60, 40, 3);
    expect(twinkleIndices(60, 40, 3)).toEqual(a);
    const ratio = a.length / (60 * 40);
    expect(ratio).toBeGreaterThan(0.008);
    expect(ratio).toBeLessThan(0.04);
    expect(twinkleIndices(60, 40, 4)).not.toEqual(a);
  });
});

describe('hueHash', () => {
  it('결정적이고 [0, 1) 범위다', () => {
    expect(hueHash(3, 7)).toBe(hueHash(3, 7));
    for (let c = 0; c < 20; c++) {
      for (let r = 0; r < 20; r++) {
        const h = hueHash(c, r);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
      }
    }
  });

  it('accentHash 와 상관이 끊긴다(스폿 체크)', () => {
    expect(hueHash(2, 5)).not.toBe(accentHash(2, 5));
  });
});

describe('hueBucket', () => {
  it('경계에서 0/1/2 를 반환하고 항상 유효 범위다', () => {
    expect(hueBucket(0)).toBe(0);
    expect(hueBucket(1 / HUE_BUCKETS - 0.001)).toBe(0);
    expect(hueBucket(1 / HUE_BUCKETS)).toBe(1);
    expect(hueBucket((2 * 1) / HUE_BUCKETS)).toBe(2);
    expect(hueBucket(0.999999)).toBe(HUE_BUCKETS - 1);
    for (let i = 0; i < 1000; i++) {
      const b = hueBucket(i / 1000);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(HUE_BUCKETS);
    }
  });
});

describe('restAlpha', () => {
  it('셀별 휴지 알파는 [MIN, MIN+SPAN) 범위다', () => {
    for (let c = 0; c < 30; c++) {
      for (let r = 0; r < 30; r++) {
        const alpha = restAlpha(c, r);
        expect(alpha).toBeGreaterThanOrEqual(REST_ALPHA_MIN);
        expect(alpha).toBeLessThan(REST_ALPHA_MIN + REST_ALPHA_SPAN);
      }
    }
  });
});
