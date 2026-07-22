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
    expect(screen.getByText('최종 견적 요청 정보 확인')).toBeInTheDocument();
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
    await user.click(screen.getByText('최종 견적 요청 정보 확인'));
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
    await user.click(screen.getByText('최종 견적 요청 정보 확인'));
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

  // ── 유효성 표시 ✓/✗ ─────────────────────────────────────────────────────

  it('failedAt 있는 비활성 미완료 step은 ✗를 표시한다', () => {
    // failedAt=[false, true, true, true] → steps 2, 3, 4 실패 이력 → ✗ 표시
    render(
      <WizardStepSidebar
        currentStep={1}
        completed={[true, false, false, false]}
        failedAt={[false, true, true, true]}
        onStepClick={vi.fn()}
      />,
    );
    expect(screen.getAllByText('✗')).toHaveLength(3);
  });

  it('failedAt 없으면 비활성 미완료 step도 ✗ 없이 번호를 표시한다', () => {
    // 초기 렌더(failedAt 미전달) → steps 2, 3, 4 아직 시도 없음 → ✗ 없음
    render(
      <WizardStepSidebar
        currentStep={1}
        completed={[true, false, false, false]}
        onStepClick={vi.fn()}
      />,
    );
    expect(screen.queryAllByText('✗')).toHaveLength(0);
  });

  it('완료 비활성 step은 ✓, failedAt 있는 미완료 비활성 step은 ✗로 구분 표시한다', () => {
    // Step 1: active → 번호 / Step 2: 비활성+완료 → ✓ / Steps 3, 4: 비활성+미완료+실패이력 → ✗
    render(
      <WizardStepSidebar
        currentStep={1}
        completed={[true, true, false, false]}
        failedAt={[false, false, true, true]}
        onStepClick={vi.fn()}
      />,
    );
    expect(screen.getAllByText('✓')).toHaveLength(1);
    expect(screen.getAllByText('✗')).toHaveLength(2);
  });

  // ── 도달 불가 step 스타일 ─────────────────────────────────────────────────

  it('도달 불가 step(이전 step 미완료)에는 cursor-not-allowed opacity-50 스타일이 적용된다', () => {
    // completed[1]=false → canNavigateTo(3) = [true, false].every = false → PG 선택 차단
    render(
      <WizardStepSidebar
        currentStep={1}
        completed={[true, false, false, false]}
        onStepClick={vi.fn()}
      />,
    );
    const pgButton = screen.getByText('PG 선택').closest('button');
    expect(pgButton).toHaveClass('cursor-not-allowed', 'opacity-50');
  });

  // ── 라벨 색 위계 ─────────────────────────────────────────────────────────
  // 활성만 주 텍스트 톤이고 완료·실패·미방문은 한 톤으로 모인다. 세 상태의 구분은
  // 왼쪽 배지(✓/✗/번호 + 배경색)가 지므로 라벨 색은 의도적으로 같다.
  // 저대비 `outline` 을 라벨에 쓰던 시절의 위계를 되살리지 못하도록 못박는다
  // (DESIGN.md §2 — outline 은 보더 전용).
  it('활성 step 라벨만 주 텍스트 톤이고 완료·실패·미방문 라벨은 동일한 보조 톤이다', () => {
    // Step 1: 활성 / Step 2: 비활성+완료(✓) / Step 3: 비활성+미완료+실패이력(✗) / Step 4: 미방문
    render(
      <WizardStepSidebar
        currentStep={1}
        completed={[true, true, false, false]}
        failedAt={[false, false, true, false]}
        onStepClick={vi.fn()}
      />,
    );
    const labelOf = (text: string) => screen.getByText(text);

    expect(labelOf('사업자 확인')).toHaveClass('text-[var(--md-sys-color-on-surface)]');
    expect(labelOf('사업자 확인')).toHaveClass('font-semibold');

    for (const label of ['견적 내용', 'PG 선택', '최종 견적 요청 정보 확인']) {
      expect(labelOf(label), `${label} 라벨은 보조 톤이어야 한다`).toHaveClass(
        'text-[var(--md-sys-color-on-surface-variant)]',
      );
      expect(labelOf(label), `${label} 라벨에 저대비 outline 이 되살아났다`).not.toHaveClass(
        'text-[var(--md-sys-color-outline)]',
      );
    }
  });

  // 위 테스트가 라벨 색을 한 톤으로 묶어도 되는 근거는 "배지가 상태를 구분한다" 하나뿐이다.
  // 그 전제 자체를 잠가 두지 않으면 배지 배경색을 지워도 두 테스트가 모두 통과하면서
  // 완료·실패·미방문이 화면에서 완전히 구별 불가능해진다.
  it('상태 구분은 배지가 진다 — 완료·실패·미방문 배지가 서로 다른 배경색을 갖는다', () => {
    render(
      <WizardStepSidebar
        currentStep={1}
        completed={[true, true, false, false]}
        failedAt={[false, false, true, false]}
        onStepClick={vi.fn()}
      />,
    );
    const badgeOf = (label: string) =>
      screen.getByText(label).closest('button')!.querySelector('span')!;

    expect(badgeOf('사업자 확인')).toHaveClass('bg-[var(--md-sys-color-primary)]');
    expect(badgeOf('견적 내용')).toHaveClass('bg-[var(--md-sys-color-tertiary)]');
    expect(badgeOf('PG 선택')).toHaveClass('bg-[var(--md-sys-color-error)]');
    expect(badgeOf('최종 견적 요청 정보 확인')).toHaveClass(
      'bg-[var(--md-sys-color-surface-container-high)]',
    );
  });
});
