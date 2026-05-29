// components/rfp/__tests__/WizardProgressBar.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WizardProgressBar } from '../WizardProgressBar';

describe('WizardProgressBar', () => {
  it('현재 단계 레이블과 Step X/4 텍스트를 표시한다', () => {
    render(<WizardProgressBar currentStep={2} completed={[true, false, false, false]} />);
    expect(screen.getByText('Step 2 / 4 — 제안 내용')).toBeInTheDocument();
  });

  it('총 4개의 dot을 렌더한다', () => {
    render(<WizardProgressBar currentStep={1} completed={[false, false, false, false]} />);
    expect(screen.getAllByTestId('progress-dot')).toHaveLength(4);
  });

  it('완료된 step(현재 step 아님)의 dot은 done 표시(data-done)를 가진다 — 위치 무관', () => {
    // step 3만 완료, 현재는 step 1
    render(<WizardProgressBar currentStep={1} completed={[false, false, true, false]} />);
    const dots = screen.getAllByTestId('progress-dot');
    expect(dots[0]).toHaveAttribute('data-done', 'false'); // step 1: 현재 step
    expect(dots[2]).toHaveAttribute('data-done', 'true'); // step 3: 완료
  });
});
