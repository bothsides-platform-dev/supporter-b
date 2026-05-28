// components/rfp/__tests__/WizardProgressBar.test.tsx
import { render, screen } from '@testing-library/react';
import { WizardProgressBar } from '../WizardProgressBar';

describe('WizardProgressBar', () => {
  it('현재 단계 레이블과 Step X/4 텍스트를 표시한다', () => {
    render(<WizardProgressBar currentStep={2} maxReachedStep={2} />);
    expect(screen.getByText('Step 2 / 4 — 제안 내용')).toBeInTheDocument();
  });

  it('총 4개의 dot을 렌더한다', () => {
    render(<WizardProgressBar currentStep={1} maxReachedStep={1} />);
    expect(screen.getAllByTestId('progress-dot')).toHaveLength(4);
  });
});
