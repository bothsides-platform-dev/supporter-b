import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BidStepReview } from '../BidStepReview';
import type { PaymentMethod } from '@/lib/types/bid';
import { formatKRW } from '@/lib/utils/format';

afterEach(cleanup);

function renderStep(over: Partial<React.ComponentProps<typeof BidStepReview>> = {}) {
  const onSaveTemplate = vi.fn(async () => ({ ok: true as const }));
  render(
    <BidStepReview
      settleCycle="D+1"
      settleLimit="0"
      guaranteeInsurance="0"
      signupFee="0"
      feeInputMethods={['card'] as PaymentMethod[]}
      customPaymentMethods={[]}
      fees={{ card: '1.5' }}
      submitError={null}
      onSaveTemplate={onSaveTemplate}
      {...over}
    />,
  );
  return { onSaveTemplate };
}

describe('BidStepReview', () => {
  it('비가역 경고를 보여준다', () => {
    renderStep();
    expect(screen.getByText(/한 번만/)).toBeInTheDocument();
  });

  it('템플릿 저장 토글 → 이름 입력 → 저장 시 onSaveTemplate(name) 호출', async () => {
    const user = userEvent.setup();
    const { onSaveTemplate } = renderStep();
    await user.click(screen.getByRole('button', { name: '템플릿으로 저장' }));
    await user.type(screen.getByPlaceholderText('템플릿 이름'), '기본요율');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(onSaveTemplate).toHaveBeenCalledWith('기본요율');
  });

  it('가입비 행을 KRW 포맷으로 보여준다', () => {
    renderStep({ signupFee: '550000' });
    expect(screen.getByText('가입비')).toBeInTheDocument();
    expect(screen.getByText(formatKRW(550000))).toBeInTheDocument();
  });

  it('정액(건당) 수단은 % 가 아니라 원으로 요약 표시한다', () => {
    render(
      <BidStepReview
        settleCycle="D+1" settleLimit="0" guaranteeInsurance="0" signupFee="0"
        feeInputMethods={['virtual_account'] as PaymentMethod[]}
        customPaymentMethods={[]}
        fees={{ virtual_account: '300' }}
        submitError={null}
        onSaveTemplate={async () => ({ ok: true })}
      />,
    );
    expect(screen.getByText(/가상계좌/)).toBeInTheDocument();
    expect(screen.getByText('300원')).toBeInTheDocument();
    expect(screen.queryByText('300%')).toBeNull();
  });

  it('구간 수단은 구간별 요율을 요약 표시한다', () => {
    render(
      <BidStepReview
        settleCycle="D+1" settleLimit="0" guaranteeInsurance="0" signupFee="0"
        feeInputMethods={['card'] as PaymentMethod[]}
        customPaymentMethods={[]}
        fees={{ 'card:sole': '0.5', 'card:general': '1.8' }}
        submitError={null}
        onSaveTemplate={async () => ({ ok: true })}
      />,
    );
    expect(screen.getByText('카드')).toBeInTheDocument();
    expect(screen.getByText(/영세/)).toBeInTheDocument();
    expect(screen.getByText(/0\.5%/)).toBeInTheDocument();
    expect(screen.getByText(/1\.8%/)).toBeInTheDocument();
  });

  it('INVALID_ATTACHMENT 는 친절한 한국어로 보여주고 raw 코드는 노출하지 않는다', () => {
    renderStep({ submitError: 'INVALID_ATTACHMENT' });
    expect(
      screen.getByText('첨부한 견적서를 확인할 수 없어요. 다시 올려주세요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('INVALID_ATTACHMENT')).toBeNull();
  });
});
