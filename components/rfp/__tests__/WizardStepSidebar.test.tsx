// components/rfp/__tests__/WizardStepSidebar.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WizardStepSidebar } from '../WizardStepSidebar';

afterEach(cleanup);

describe('WizardStepSidebar', () => {
  it('4개 단계 레이블을 모두 렌더한다', () => {
    render(
      <WizardStepSidebar
        currentStep={1}
        completed={[false, false, false, false]}
        onStepClick={vi.fn()}
      />,
    );
    expect(screen.getByText('사업자 확인')).toBeInTheDocument();
    expect(screen.getByText('견적 내용')).toBeInTheDocument();
    expect(screen.getByText('PG 선택')).toBeInTheDocument();
    expect(screen.getByText('보내기 확인')).toBeInTheDocument();
  });

  it('완료된 step(현재 step 아님)은 ✓를 표시한다 — 위치가 아니라 입력 기준', () => {
    // step 2만 완료, 현재 step은 1
    render(
      <WizardStepSidebar
        currentStep={1}
        completed={[false, true, false, false]}
        onStepClick={vi.fn()}
      />,
    );
    expect(screen.getAllByText('✓')).toHaveLength(1);
  });

  it('현재 step은 완료 상태여도 ✓ 대신 번호를 표시한다', () => {
    render(
      <WizardStepSidebar
        currentStep={2}
        completed={[true, true, false, false]}
        onStepClick={vi.fn()}
      />,
    );
    // step 1 완료(✓), step 2는 현재 step이라 번호 유지 → ✓는 1개
    expect(screen.getAllByText('✓')).toHaveLength(1);
  });

  it('아직 완료되지 않은 미래 step도 클릭하면 onStepClick(해당번호)를 호출한다 (자유 이동)', async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    render(
      <WizardStepSidebar
        currentStep={1}
        completed={[false, false, false, false]}
        onStepClick={onStepClick}
      />,
    );
    await user.click(screen.getByText('보내기 확인'));
    expect(onStepClick).toHaveBeenCalledWith(4);
  });

  it('이전 step 클릭 시 onStepClick(해당번호)를 호출한다', async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    render(
      <WizardStepSidebar
        currentStep={3}
        completed={[true, true, false, false]}
        onStepClick={onStepClick}
      />,
    );
    await user.click(screen.getByText('사업자 확인'));
    expect(onStepClick).toHaveBeenCalledWith(1);
  });

  it('미충족(미완료) 미래 단계도 자유롭게 클릭해 이동할 수 있다', async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    render(
      <WizardStepSidebar
        currentStep={2}
        completed={[false, false, false, false]}
        onStepClick={onStepClick}
      />,
    );
    // PG 선택(3), 발송 확인(4) 모두 미완료여도 클릭 가능
    await user.click(screen.getByText('PG 선택'));
    expect(onStepClick).toHaveBeenCalledWith(3);
    await user.click(screen.getByText('보내기 확인'));
    expect(onStepClick).toHaveBeenCalledWith(4);
  });

  it('기본값: 구매사 단계 라벨 + 제목을 렌더', () => {
    render(<WizardStepSidebar currentStep={1} completed={[false, false, false, false]} onStepClick={vi.fn()} />);
    expect(screen.getByText('새 견적 요청')).toBeInTheDocument();
    expect(screen.getByText('사업자 확인')).toBeInTheDocument();
  });

  it('steps·title prop으로 견적 작성 단계를 렌더', () => {
    render(
      <WizardStepSidebar
        currentStep={2}
        completed={[true, false, false, false]}
        onStepClick={vi.fn()}
        steps={[
          { num: 1, label: '정산 조건' },
          { num: 2, label: '수수료' },
        ]}
        title="견적 작성"
      />,
    );
    expect(screen.getByText('견적 작성')).toBeInTheDocument();
    expect(screen.getByText('수수료')).toBeInTheDocument();
    expect(screen.queryByText('사업자 확인')).not.toBeInTheDocument();
  });

  it('footer prop을 하단에 렌더한다', () => {
    render(
      <WizardStepSidebar
        currentStep={1}
        completed={[false, false]}
        onStepClick={vi.fn()}
        steps={[{ num: 1, label: '정산 조건' }, { num: 2, label: '수수료' }]}
        title="견적 작성"
        footer={<span>자동저장됨</span>}
      />,
    );
    expect(screen.getByText('자동저장됨')).toBeInTheDocument();
  });

  it('className prop을 nav 요소에 병합해 적용한다', () => {
    render(
      <WizardStepSidebar
        currentStep={1}
        completed={[false, false, false, false]}
        onStepClick={vi.fn()}
        className="sticky top-0 self-start border-r-0"
      />,
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveClass('sticky', 'top-0', 'self-start');
    // twMerge로 기존 border-r가 border-r-0에 의해 제거된다 (정확히 'border-r' 토큰만 검사)
    const tokens = nav.className.split(/\s+/);
    expect(tokens).not.toContain('border-r');
    expect(tokens).toContain('border-r-0');
  });
});
