import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BidStepReview } from '../BidStepReview';
import type { PaymentMethod } from '@/lib/types/bid';

afterEach(cleanup);

function renderStep(over: Partial<React.ComponentProps<typeof BidStepReview>> = {}) {
  const onSubmit = vi.fn();
  const onSaveTemplate = vi.fn(async () => ({ ok: true as const }));
  render(
    <BidStepReview
      settleCycle="D+1"
      settleLimit="0"
      guaranteeInsurance="0"
      feeInputMethods={['card'] as PaymentMethod[]}
      customPaymentMethods={[]}
      fees={{ card: '1.5' }}
      canSubmit
      pending={false}
      submitError={null}
      onBack={vi.fn()}
      onSubmit={onSubmit}
      onSaveTemplate={onSaveTemplate}
      {...over}
    />,
  );
  return { onSubmit, onSaveTemplate };
}

describe('BidStepReview', () => {
  it('비가역 경고를 보여준다', () => {
    renderStep();
    expect(screen.getByText(/한 번만/)).toBeInTheDocument();
  });

  it('canSubmit=false면 발송 버튼 비활성', () => {
    renderStep({ canSubmit: false });
    expect(screen.getByRole('button', { name: /견적 보내기/ })).toBeDisabled();
  });

  it('발송 버튼 클릭 시 onSubmit 호출', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderStep();
    await user.click(screen.getByRole('button', { name: /견적 보내기/ }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('템플릿 저장 토글 → 이름 입력 → 저장 시 onSaveTemplate(name) 호출', async () => {
    const user = userEvent.setup();
    const { onSaveTemplate } = renderStep();
    await user.click(screen.getByRole('button', { name: '템플릿으로 저장' }));
    await user.type(screen.getByPlaceholderText('템플릿 이름'), '기본요율');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(onSaveTemplate).toHaveBeenCalledWith('기본요율');
  });

  it('구간 수단은 구간별 요율을 요약 표시한다', () => {
    render(
      <BidStepReview
        settleCycle="D+1" settleLimit="0" guaranteeInsurance="0"
        feeInputMethods={['card'] as PaymentMethod[]}
        customPaymentMethods={[]}
        fees={{ 'card:sole': '0.5', 'card:general': '1.8' }}
        canSubmit pending={false} submitError={null}
        onBack={() => {}} onSubmit={() => {}} onSaveTemplate={async () => ({ ok: true })}
      />,
    );
    expect(screen.getByText('카드')).toBeInTheDocument();
    expect(screen.getByText(/영세/)).toBeInTheDocument();
    expect(screen.getByText(/0\.5%/)).toBeInTheDocument();
    expect(screen.getByText(/1\.8%/)).toBeInTheDocument();
  });
});
