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

  // 게이트는 **다 친 번호**에만 말해야 한다. `010` 세 글자만 친 순간에 "010 만
  // 지원해요" 가 뜨면 정확히 맞게 치고 있는 사람을 나무라는 꼴이다 — 그래서
  // blockedNon010 이 isCompletePhone 을 먼저 요구한다. 그 조건을 빼도 위의
  // 완성-번호 테스트들은 전부 그대로 통과하므로, 이 테스트가 없으면 규율이
  // 주석으로만 남는다.
  it('입력 도중에는 안내를 띄우지 않는다 (완성된 번호에만 판정)', async () => {
    render(<PhoneVerificationField onVerified={() => {}} requireMobile010 />);
    const input = screen.getByLabelText('휴대전화');

    // 올바른 010 을 치는 중 — 아직 미완성이다.
    await userEvent.type(input, '010');
    expect(screen.queryByText(/010 번호만/)).not.toBeInTheDocument();

    // 011 을 치는 중이어도 미완성인 동안은 조용하다.
    await userEvent.clear(input);
    await userEvent.type(input, '0111234');
    expect(screen.queryByText(/010 번호만/)).not.toBeInTheDocument();

    // 다 치면 그때 말한다.
    await userEvent.type(input, '5678');
    expect(screen.getByText(/010 번호만/)).toBeInTheDocument();
  });
});
