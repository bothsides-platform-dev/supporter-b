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

  // v0.4.34.0 이 `submitBidAction` 의 정산한도를 `.gt(0)` 으로 조였다. 클라 게이트를
  // 우회한 호출(예전 화면을 열어 둔 채 제출)은 이제 INVALID_INPUT 으로 돌아오는데,
  // 사용자는 4단계(검토) 화면을 보고 있고 원인은 1단계 칸이다 — 어느 칸인지
  // 말해 주지 않으면 이 화면에서 원인을 찾을 수 없다. 템플릿 저장 경로
  // (`quoteTemplateErrorMessage`)는 같은 릴리스에서 이미 이 힌트를 받았다.
  it('INVALID_INPUT 은 원인이 되는 칸(정산한도)을 지목한다', () => {
    renderStep({ submitError: 'INVALID_INPUT' });
    const msg = screen.getByText(/입력 값을 확인해 주세요/);
    expect(msg).toBeInTheDocument();
    expect(msg.textContent).toContain('정산한도');
    expect(msg.textContent).toContain('0');
  });

  // 이 화면의 폴백은 `?? submitError` 였다 — 미매핑 코드를 **그대로** 화면에 찍어서
  // PG 담당자에게 내부 enum 이 노출됐다. 같은 릴리스가 설정 폼 세 곳에서 없앤 결함이
  // 견적 제출(PG 의 가장 중요한 흐름)에만 남아 있었다.
  it('사전에 없는 코드는 원문 대신 일반 안내로 떨어진다', () => {
    renderStep({ submitError: 'SOME_NEW_SERVER_CODE' });
    expect(screen.queryByText(/SOME_NEW_SERVER_CODE/)).toBeNull();
    expect(screen.getByText('견적을 보내지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
  });

  // 프로토타입 체인 키가 오면 객체 리터럴 조회는 **함수**를 잡아내고 `??` 가 발동하지
  // 않는다(errorLabel 의 hasOwnProperty 판정이 막는 축).
  it.each(['constructor', 'toString'])('프로토타입 체인 키(%s)도 일반 안내로 떨어진다', (code) => {
    renderStep({ submitError: code });
    expect(
      screen.getByText('견적을 보내지 못했어요. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument();
  });
});
