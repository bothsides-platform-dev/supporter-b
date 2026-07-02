import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ScrollPinnedSection } from '@/components/landing/ScrollPinnedSection';

describe('ScrollPinnedSection', () => {
  it('항상 pin으로 렌더하고 children에 pinned=true·activeStep(초기 0)을 넘긴다', () => {
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
    // 정적 폴백 제거 — 모바일·저감모션 포함 항상 pin(사용자 요청). 초기 진행률 0 → activeStep 0.
    expect(screen.getByTestId('pinned').textContent).toBe('true');
    expect(screen.getByTestId('step').textContent).toBe('0');
  });

  it('steps<=0에서도 safeSteps 가드로 activeStep이 유한한 값으로 clamp된다', () => {
    render(
      <ScrollPinnedSection steps={0}>
        {({ activeStep }) => <span data-testid="step">{activeStep}</span>}
      </ScrollPinnedSection>,
    );
    const step = Number(screen.getByTestId('step').textContent);
    expect(Number.isFinite(step)).toBe(true);
    expect(step).toBe(0);
  });
});
