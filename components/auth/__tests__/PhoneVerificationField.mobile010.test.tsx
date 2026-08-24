// 간편인증 전용 010 게이트.
//
// 서명 본인인증은 **010 만** 받는다(`resolveSecurityMethod`). 그런데 OTP 왕복은
// `01[0-9]` 를 전부 통과시킨다(`isCompletePhone`·`normalizePhone`) — 그래서 011 번호는
// 클라 게이트를 지나고, 서버가 **실제 SMS 를 보내고**, 사용자가 인증번호까지 맞힌
// 뒤에야 마지막 저장에서 PHONE_NOT_MOBILE_010 으로 거절된다. 실비가 나가고, 규칙은
// 여정의 맨 끝에서야 드러난다.
//
// 규칙이 걸리는 화면(설정 > 프로필)에서는 **SMS 이전에** 막고 이유를 말해야 한다.
// 가입은 010 규칙이 없으므로 기본값은 그대로 둔다 — 옵트인 prop 이다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const sendPhoneOtpAction = vi.fn(
  async (_input: { phone: string }) => ({ ok: true }) as { ok: boolean; error?: string },
);
vi.mock('@/lib/server/actions/auth/sendPhoneOtpAction', () => ({
  sendPhoneOtpAction: (input: { phone: string }) => sendPhoneOtpAction(input),
}));
vi.mock('@/lib/server/actions/auth/verifyPhoneOtpAction', () => ({
  verifyPhoneOtpAction: vi.fn(),
}));

import { PhoneVerificationField } from '../PhoneVerificationField';

afterEach(() => {
  cleanup();
  sendPhoneOtpAction.mockClear();
});

const sendButton = () => screen.getByRole('button', { name: /인증하기|재전송/ });

describe('PhoneVerificationField — requireMobile010', () => {
  it('011 번호는 SMS 를 보내기 전에 막고 이유를 말한다', async () => {
    render(<PhoneVerificationField onVerified={() => {}} requireMobile010 />);

    await userEvent.type(screen.getByLabelText('휴대전화'), '01112345678');

    expect(sendButton()).toBeDisabled();
    expect(screen.getByText(/010/)).toBeInTheDocument();
    // 핵심 단언 — 실비가 나가는 호출이 아예 없어야 한다.
    expect(sendPhoneOtpAction).not.toHaveBeenCalled();
  });

  it('010 번호는 평소대로 보낸다', async () => {
    render(<PhoneVerificationField onVerified={() => {}} requireMobile010 />);

    await userEvent.type(screen.getByLabelText('휴대전화'), '01012345678');
    expect(sendButton()).toBeEnabled();

    await userEvent.click(sendButton());
    expect(sendPhoneOtpAction).toHaveBeenCalledTimes(1);
  });

  // 가입은 010 규칙이 없다 — prop 을 안 주면 동작이 바뀌면 안 된다.
  it('prop 없이는 011 번호도 종전대로 통과한다', async () => {
    render(<PhoneVerificationField onVerified={() => {}} />);

    await userEvent.type(screen.getByLabelText('휴대전화'), '01112345678');
    expect(sendButton()).toBeEnabled();
  });
});
