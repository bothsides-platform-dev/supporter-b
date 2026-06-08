// components/rfp/__tests__/WizardProgressBar.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WizardProgressBar } from '../WizardProgressBar';

afterEach(cleanup);

describe('WizardProgressBar', () => {
  it('현재 단계 레이블과 Step X/4 텍스트를 표시한다', () => {
    render(<WizardProgressBar currentStep={2} completed={[true, false, false, false]} />);
    expect(screen.getByText('Step 2 / 4 — 견적 내용')).toBeInTheDocument();
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

  it('기본값: 4단계 dot + 구매사 라벨', () => {
    render(<WizardProgressBar currentStep={1} completed={[false, false, false, false]} onStepClick={vi.fn()} />);
    expect(screen.getAllByTestId('progress-dot')).toHaveLength(4);
    expect(screen.getByText(/사업자 확인/)).toBeInTheDocument();
  });

  it('failedAt 있는 미완료 비활성 dot에 data-error="true" 속성이 적용된다', () => {
    // step 1: active, step 2: 비활성+미완료+실패이력 → data-error="true"
    render(<WizardProgressBar currentStep={1} completed={[true, false, false, false]} failedAt={[false, true, false, false]} />);
    const dots = screen.getAllByTestId('progress-dot');
    expect(dots[1]).toHaveAttribute('data-error', 'true');
    expect(dots[0]).not.toHaveAttribute('data-error', 'true'); // active step
  });

  it('failedAt 없으면 미완료 비활성 dot도 data-error="false"이다', () => {
    // 초기 렌더 — 아직 어떤 step도 시도하지 않음
    render(<WizardProgressBar currentStep={1} completed={[true, false, false, false]} />);
    const dots = screen.getAllByTestId('progress-dot');
    expect(dots[1]).toHaveAttribute('data-error', 'false');
  });

  it('steps prop: 단계 수·라벨이 바뀐다', () => {
    // currentStep=4 → span에 "Step 4 / 4 — 검토·발송"이 보임.
    // 기본 4단계 라벨은 "보내기 확인"이므로 "검토·발송"이 보이면 steps prop이 적용된 것.
    render(
      <WizardProgressBar
        currentStep={4}
        completed={[true, true, true, false]}
        onStepClick={vi.fn()}
        steps={[
          { num: 1, label: '정산 조건' },
          { num: 2, label: '수수료' },
          { num: 3, label: '견적서' },
          { num: 4, label: '검토·발송' },
        ]}
      />,
    );
    expect(screen.getByText(/검토·발송/)).toBeInTheDocument();
  });
});
