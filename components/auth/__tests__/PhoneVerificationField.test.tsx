import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockSend = vi.fn();
const mockVerify = vi.fn();
vi.mock('@/lib/server/actions/auth/sendPhoneOtpAction', () => ({
  sendPhoneOtpAction: (...args: unknown[]) => mockSend(...args),
}));
vi.mock('@/lib/server/actions/auth/verifyPhoneOtpAction', () => ({
  verifyPhoneOtpAction: (...args: unknown[]) => mockVerify(...args),
}));

import { PhoneVerificationField } from '@/components/auth/PhoneVerificationField';

beforeEach(() => {
  mockSend.mockReset();
  mockVerify.mockReset();
});

describe('PhoneVerificationField — 하이픈 입력 마스킹', () => {
  it('숫자 입력 시 010-XXXX-XXXX 형식으로 마스킹된다', async () => {
    const user = userEvent.setup();
    render(<PhoneVerificationField onVerified={vi.fn()} />);

    const input = screen.getByLabelText('휴대전화') as HTMLInputElement;
    await user.type(input, '01012345678');

    expect(input.value).toBe('010-1234-5678');
  });

  it('완전한 번호 형식이 되기 전에는 인증하기 버튼이 비활성화된다', async () => {
    const user = userEvent.setup();
    render(<PhoneVerificationField onVerified={vi.fn()} />);

    const input = screen.getByLabelText('휴대전화');
    await user.type(input, '010');

    expect(screen.getByRole('button', { name: '인증하기' })).toBeDisabled();
  });

  it('완전한 번호를 입력하면 인증하기 버튼이 활성화된다', async () => {
    const user = userEvent.setup();
    render(<PhoneVerificationField onVerified={vi.fn()} />);

    await user.type(screen.getByLabelText('휴대전화'), '01012345678');

    expect(screen.getByRole('button', { name: '인증하기' })).toBeEnabled();
  });

  it('중간 글자를 수정해도 커서가 끝으로 튀지 않는다', async () => {
    const user = userEvent.setup();
    render(<PhoneVerificationField onVerified={vi.fn()} />);

    const input = screen.getByLabelText('휴대전화') as HTMLInputElement;
    await user.type(input, '0101234'); // 7 digits → '010-123-4'
    expect(input.value).toBe('010-123-4');

    // offset 2('01|0-123-4')에 '9' 삽입 → 세 번째 숫자 뒤(offset 3)에 커서가 남아야 함
    await user.type(input, '9', {
      initialSelectionStart: 2,
      initialSelectionEnd: 2,
    });

    expect(input.value).toBe('019-012-34');
    // 커서가 삽입 지점 근처(offset 3)에 남고, 끝(value.length)으로 튀지 않는다
    expect(input.selectionStart).toBe(3);
    expect(input.selectionStart).not.toBe(input.value.length);
  });

  it('인증 성공 시 onVerified를 하이픈 형식으로 호출한다', async () => {
    mockSend.mockResolvedValueOnce({ ok: true });
    mockVerify.mockResolvedValueOnce({ ok: true, verificationId: 'vid-1' });
    const onVerified = vi.fn();
    const user = userEvent.setup();
    render(<PhoneVerificationField onVerified={onVerified} />);

    await user.type(screen.getByLabelText('휴대전화'), '01012345678');
    await user.click(screen.getByRole('button', { name: '인증하기' }));

    const otpInput = await screen.findByLabelText('인증번호');
    await user.type(otpInput, '123456');
    await user.click(screen.getByRole('button', { name: '확인' }));

    await waitFor(() => {
      expect(onVerified).toHaveBeenCalledWith('010-1234-5678', 'vid-1');
    });
    // send/verify 액션에도 하이픈 형식으로 전달
    expect(mockSend).toHaveBeenCalledWith({ phone: '010-1234-5678' });
    expect(mockVerify).toHaveBeenCalledWith({ phone: '010-1234-5678', code: '123456' });
  });

  // OTP 만료 카운트다운은 라벨이 아니라 수치다 — DESIGN.md §3 의 .md-numeric
  // 카브아웃(mono + tabular-nums)으로 렌더돼야 초가 줄어도 자릿수가 흔들리지
  // 않는다. 같은 span 의 else 가지(재전송 버튼)는 한글이라 이 카브아웃 밖이다.
  it('OTP 만료 카운트다운은 .md-numeric 으로 렌더된다', async () => {
    mockSend.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    const { container } = render(<PhoneVerificationField onVerified={vi.fn()} />);

    await user.type(screen.getByLabelText('휴대전화'), '01012345678');
    await user.click(screen.getByRole('button', { name: '인증하기' }));
    await screen.findByLabelText('인증번호');

    const numerics = Array.from(container.querySelectorAll('.md-numeric'))
      .map((el) => el.textContent ?? '')
      .filter((t) => /^\d{2}:\d{2}$/.test(t));
    expect(numerics).toHaveLength(1);
  });
});

describe('PhoneVerificationField — 외부 API 실패 처리', () => {
  it('발송 액션 throw 시 무한 로딩에 빠지지 않는다', async () => {
    const user = userEvent.setup();
    mockSend.mockRejectedValue(new Error('network'));

    render(<PhoneVerificationField onVerified={vi.fn()} />);
    await user.type(screen.getByLabelText('휴대전화'), '01012345678');
    await user.click(screen.getByRole('button', { name: '인증하기' }));

    await waitFor(() =>
      expect(screen.queryByText('LOADING…')).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(/오류가 발생했습니다/)).toBeInTheDocument();
  });

  it('확인 액션 throw 시 무한 로딩에 빠지지 않는다', async () => {
    const user = userEvent.setup();
    mockSend.mockResolvedValue({ ok: true });
    mockVerify.mockRejectedValue(new Error('network'));

    render(<PhoneVerificationField onVerified={vi.fn()} />);
    await user.type(screen.getByLabelText('휴대전화'), '01012345678');
    await user.click(screen.getByRole('button', { name: '인증하기' }));

    await waitFor(() =>
      expect(screen.getByLabelText('인증번호')).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText('인증번호'), '123456');
    await user.click(screen.getByRole('button', { name: '확인' }));

    await waitFor(() =>
      expect(screen.queryByText('LOADING…')).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(/오류가 발생했습니다/)).toBeInTheDocument();
  });
});

describe('OTP Enter 키 라우팅', () => {
  it('OTP 6자리 입력 후 Enter를 누르면 verifyPhoneOtpAction을 호출하고 폼 submit을 막는다', async () => {
    mockSend.mockResolvedValueOnce({ ok: true });
    mockVerify.mockResolvedValueOnce({ ok: true, verificationId: 'vid-enter' });
    const formSubmit = vi.fn();
    const onVerified = vi.fn();
    const user = userEvent.setup();

    render(
      <form onSubmit={formSubmit}>
        <PhoneVerificationField onVerified={onVerified} />
        <button type="submit">폼제출</button>
      </form>,
    );

    // 전화번호 입력 → 인증하기 클릭 → OTP 단계 진입
    await user.type(screen.getByLabelText('휴대전화'), '01012345678');
    await user.click(screen.getByRole('button', { name: '인증하기' }));

    // OTP 6자리 입력 후 Enter
    await user.type(screen.getByLabelText('인증번호'), '123456');
    await user.keyboard('{Enter}');

    expect(mockVerify).toHaveBeenCalledOnce();
    expect(formSubmit).not.toHaveBeenCalled();
    expect(onVerified).toHaveBeenCalledWith('010-1234-5678', 'vid-enter');
  });

  it('OTP 입력이 6자리 미만이면 Enter가 verifyPhoneOtpAction을 호출하지 않는다', async () => {
    mockSend.mockResolvedValueOnce({ ok: true });
    const formSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <form onSubmit={formSubmit}>
        <PhoneVerificationField onVerified={vi.fn()} />
      </form>,
    );

    await user.type(screen.getByLabelText('휴대전화'), '01012345678');
    await user.click(screen.getByRole('button', { name: '인증하기' }));
    await user.type(screen.getByLabelText('인증번호'), '123');

    await user.keyboard('{Enter}');

    expect(mockVerify).not.toHaveBeenCalled();
    expect(formSubmit).not.toHaveBeenCalled();
  });
});
