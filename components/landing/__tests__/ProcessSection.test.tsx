import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProcessSection } from '../ProcessSection';

const STEP_TITLES = [
  '사업자 정보 확인',
  '견적 내용 입력',
  'PG 선택',
  '최종 견적 요청 정보 확인',
  'PG사 비교 견적',
  '최종 PG사 선정',
];

describe('ProcessSection', () => {
  it('renders all six process steps in the stepper', () => {
    render(<ProcessSection />);
    for (const title of STEP_TITLES) {
      expect(screen.getByRole('button', { name: new RegExp(title) })).toBeInTheDocument();
    }
  });

  it('shows the first step detail by default', () => {
    render(<ProcessSection />);
    expect(screen.getByText(/기본적인 사업자 정보를 입력/)).toBeInTheDocument();
  });

  it('switches the detail when another step is selected', () => {
    render(<ProcessSection />);
    fireEvent.click(screen.getByRole('button', { name: /PG 선택/ }));
    expect(screen.getByText(/견적을 받고 싶은 PG사를 선택/)).toBeInTheDocument();
  });

  it('marks the active step with aria-current', () => {
    render(<ProcessSection />);
    const first = screen.getByRole('button', { name: /사업자 정보 확인/ });
    expect(first).toHaveAttribute('aria-current', 'step');
  });
});
