import { describe, it, expect } from 'vitest';
import { demoFitScale } from '../use-demo-fit-scale';

// 데모 창(box)이 데스크톱 캔버스(1080)보다 좁으면 그 비율만큼 축소해 레이아웃 줄바꿈을 막는다.
// 넓거나 같으면 1(원본), 미측정(0)이면 1 폴백.
describe('demoFitScale', () => {
  it('창이 캔버스보다 넓거나 같으면 축소하지 않는다(1)', () => {
    expect(demoFitScale(1080, 1080)).toBe(1);
    expect(demoFitScale(1280, 1080)).toBe(1);
  });

  it('창이 좁으면 창/캔버스 비율로 축소한다', () => {
    expect(demoFitScale(540, 1080)).toBe(0.5);
    expect(demoFitScale(810, 1080)).toBeCloseTo(0.75);
  });

  it('폭이 0/미측정이면 1로 폴백한다(SSR·초기 렌더 안전)', () => {
    expect(demoFitScale(0, 1080)).toBe(1);
  });
});
