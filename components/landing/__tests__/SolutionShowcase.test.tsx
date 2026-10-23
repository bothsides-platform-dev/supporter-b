import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// 표는 자체 스위트(OfferComparisonTable.test.tsx)가 커버한다. jsdom엔 IntersectionObserver가
// 없어 표의 whileInView가 그대로면 크래시하므로, 이 스위트는 포인트 목록/스테퍼에만 집중한다.
vi.mock('@/components/landing/OfferComparisonTable', () => ({
  OfferComparisonTable: () => null,
}));

import { SolutionShowcase } from '@/components/landing/SolutionShowcase';

const POINTS = ['첫째 포인트', '둘째 포인트', '셋째 포인트'];

describe('SolutionShowcase (controlled)', () => {
  it('activeStep 미제공 시 모든 포인트가 평평(강조 없음)하다', () => {
    render(<SolutionShowcase points={POINTS} />);
    for (const p of POINTS) {
      const li = screen.getByText(p).closest('li') as HTMLLIElement;
      expect(li.getAttribute('data-active')).toBeNull();
      expect(li.style.opacity).toBe('1');
    }
  });

  it('activeStep=1이면 해당 포인트만 강조하고 나머지는 디밍한다', () => {
    render(<SolutionShowcase points={POINTS} activeStep={1} />);
    const active = screen.getByText(POINTS[1]).closest('li') as HTMLLIElement;
    const other = screen.getByText(POINTS[0]).closest('li') as HTMLLIElement;
    expect(active.getAttribute('data-active')).toBe('true');
    expect(other.getAttribute('data-active')).toBeNull();
    expect(other.style.opacity).toBe('0.4');
  });

  it('타이머 없이 activeStep 변화에만 반응한다(리렌더)', () => {
    const { rerender } = render(<SolutionShowcase points={POINTS} activeStep={0} />);
    expect((screen.getByText(POINTS[0]).closest('li') as HTMLLIElement).getAttribute('data-active')).toBe('true');
    rerender(<SolutionShowcase points={POINTS} activeStep={2} />);
    expect((screen.getByText(POINTS[2]).closest('li') as HTMLLIElement).getAttribute('data-active')).toBe('true');
    expect((screen.getByText(POINTS[0]).closest('li') as HTMLLIElement).getAttribute('data-active')).toBeNull();
  });
});
