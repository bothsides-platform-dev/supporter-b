import { describe, it, expect } from 'vitest';
import {
  SCRAMBLE_CHARS,
  splitGraphemes,
  buildTransition,
  slotState,
  randomGlyph,
} from '../scramble';

describe('splitGraphemes', () => {
  it('한글 문구를 글자 단위로 분해한다', () => {
    expect(splitGraphemes('협상의 주도권을')).toEqual([
      '협', '상', '의', ' ', '주', '도', '권', '을',
    ]);
  });

  it('빈 문자열은 빈 배열이다', () => {
    expect(splitGraphemes('')).toEqual([]);
  });
});

describe('buildTransition', () => {
  it('슬롯 수는 더 긴 문구 길이를 따른다', () => {
    const schedules = buildTransition('가나다', '가나다라마', () => 0.5);
    expect(schedules).toHaveLength(5);
  });

  it('각 슬롯의 from/to가 원래 문구의 같은 위치 글자와 일치한다', () => {
    const schedules = buildTransition('가나', '다라마', () => 0.5);
    expect(schedules[0]).toMatchObject({ from: '가', to: '다' });
    expect(schedules[1]).toMatchObject({ from: '나', to: '라' });
    // from 문구보다 길어진 자리는 from이 빈 문자열
    expect(schedules[2]).toMatchObject({ from: '', to: '마' });
  });

  it('to가 from보다 짧아지는 전환도 다룬다(슬롯 수는 from 길이 유지, 남는 자리는 to가 빈 문자열)', () => {
    const schedules = buildTransition('가나다라마', '가나', () => 0.5);
    expect(schedules).toHaveLength(5);
    expect(schedules[2]).toMatchObject({ from: '다', to: '' });
    expect(schedules[3]).toMatchObject({ from: '라', to: '' });
    expect(schedules[4]).toMatchObject({ from: '마', to: '' });
  });

  it('rng로 정착 시점이 [0.55, 1.0) 구간에서 결정적으로 스태거된다', () => {
    const lo = buildTransition('a', 'b', () => 0);
    const hi = buildTransition('a', 'b', () => 0.999999);
    expect(lo[0].end).toBeCloseTo(0.55, 5);
    expect(hi[0].end).toBeGreaterThan(0.999);
    expect(hi[0].end).toBeLessThan(1);
  });

  it('한 전환 안에서 슬롯마다 rng를 별도로 호출해 서로 다른 end를 받는다(스태거 자체의 검증)', () => {
    const seq = [0, 0.5, 0.999999];
    let i = 0;
    const rng = () => seq[i++];
    const schedules = buildTransition('가나다', '라마바', rng);
    expect(schedules[0].end).toBeCloseTo(0.55, 5);
    expect(schedules[1].end).toBeCloseTo(0.775, 5);
    expect(schedules[2].end).toBeGreaterThan(0.999);
    expect(new Set(schedules.map((s) => s.end)).size).toBe(3);
  });

  it('같은 rng 입력은 항상 같은 스케줄을 만든다(결정적)', () => {
    const rng = () => 0.3;
    expect(buildTransition('협상', '주도', rng)).toEqual(buildTransition('협상', '주도', rng));
  });
});

describe('slotState', () => {
  const schedule = { from: '가', to: '나', end: 0.6 };

  it('progress가 end 이상이면 정착 상태(to, opaque, full scale)를 반환한다', () => {
    expect(slotState(schedule, 0.6, '#')).toEqual({
      char: '나',
      active: false,
      opacity: 1,
      scale: 1,
    });
    expect(slotState(schedule, 1, '#')).toEqual({
      char: '나',
      active: false,
      opacity: 1,
      scale: 1,
    });
  });

  it('progress가 0이면 스크램블 최소 opacity/scale로 시작한다', () => {
    const s = slotState(schedule, 0, '#');
    expect(s).toEqual({ char: '#', active: true, opacity: 0.4, scale: 0.72 });
  });

  it('progress가 end에 가까워질수록 opacity/scale이 1로 수렴한다', () => {
    const early = slotState(schedule, 0.1, '#');
    const late = slotState(schedule, 0.5, '#');
    expect(late.opacity).toBeGreaterThan(early.opacity);
    expect(late.scale).toBeGreaterThan(early.scale);
    expect(late.opacity).toBeLessThan(1);
    expect(late.scale).toBeLessThan(1);
  });

  it('스크램블 중에는 glyph 인자를 그대로 보여준다(from/to가 아님)', () => {
    const s = slotState(schedule, 0.2, '@');
    expect(s.char).toBe('@');
    expect(s.active).toBe(true);
  });
});

describe('randomGlyph', () => {
  it('항상 SCRAMBLE_CHARS의 멤버를 반환한다', () => {
    for (let i = 0; i <= 10; i++) {
      const rng = () => i / 10;
      const g = randomGlyph(i === 10 ? () => 0.999999 : rng);
      expect(SCRAMBLE_CHARS.includes(g)).toBe(true);
    }
  });

  it('rng=0은 첫 글자, rng≈1은 마지막 글자를 고른다', () => {
    expect(randomGlyph(() => 0)).toBe(SCRAMBLE_CHARS[0]);
    expect(randomGlyph(() => 0.999999)).toBe(SCRAMBLE_CHARS[SCRAMBLE_CHARS.length - 1]);
  });
});
