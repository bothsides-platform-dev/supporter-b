// components/rfp/__tests__/WizardStepSidebar.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WizardStepSidebar } from '../WizardStepSidebar';

describe('WizardStepSidebar', () => {
  it('4개 단계 레이블을 모두 렌더한다', () => {
    render(
      <WizardStepSidebar currentStep={1} maxReachedStep={1} onStepClick={vi.fn()} />,
    );
    expect(screen.getByText('사업자 확인')).toBeInTheDocument();
    expect(screen.getByText('제안 내용')).toBeInTheDocument();
    expect(screen.getByText('PG 선택')).toBeInTheDocument();
    expect(screen.getByText('발송 확인')).toBeInTheDocument();
  });

  it('완료 단계(currentStep 미만)는 ✓를 표시한다', () => {
    render(
      <WizardStepSidebar currentStep={3} maxReachedStep={3} onStepClick={vi.fn()} />,
    );
    // step 1, 2는 완료
    const checkmarks = screen.getAllByText('✓');
    expect(checkmarks).toHaveLength(2);
  });

  it('완료 단계 클릭 시 onStepClick(해당번호)를 호출한다', async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    render(
      <WizardStepSidebar currentStep={3} maxReachedStep={3} onStepClick={onStepClick} />,
    );
    await user.click(screen.getByText('사업자 확인'));
    expect(onStepClick).toHaveBeenCalledWith(1);
  });

  it('미도달 미래 단계 클릭해도 onStepClick이 호출되지 않는다', async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    render(
      <WizardStepSidebar currentStep={2} maxReachedStep={2} onStepClick={onStepClick} />,
    );
    await user.click(screen.getByText('PG 선택'));
    expect(onStepClick).not.toHaveBeenCalled();
  });
});
