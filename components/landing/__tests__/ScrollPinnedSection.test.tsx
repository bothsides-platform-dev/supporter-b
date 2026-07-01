import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ScrollPinnedSection } from '@/components/landing/ScrollPinnedSection';

describe('ScrollPinnedSection', () => {
  it('reduced-motion(jsdom)에서는 pin 없이 children을 폴백으로 렌더한다', () => {
    render(
      <ScrollPinnedSection steps={4}>
        {({ pinned, activeStep }) => (
          <div>
            <span data-testid="pinned">{String(pinned)}</span>
            <span data-testid="step">{activeStep}</span>
          </div>
        )}
      </ScrollPinnedSection>,
    );
    // jsdom엔 matchMedia 없음 → prefersReducedMotion()=true → motionOk=false → 폴백
    expect(screen.getByTestId('pinned').textContent).toBe('false');
    expect(screen.getByTestId('step').textContent).toBe('3'); // steps-1
  });
});
