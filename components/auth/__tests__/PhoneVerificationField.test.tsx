import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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

    await waitFor(() =>
      expect(screen.queryByText('LOADING…')).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(/오류가 발생했습니다/)).toBeInTheDocument();
  });
});

describe('OTP 자동 제출', () => {
  async function enterOtpStep(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('휴대전화'), '01012345678');
    await user.click(screen.getByRole('button', { name: '인증하기' }));
    return screen.findByLabelText('인증번호');
  }

  it('6자리를 채우면 확인 버튼을 누르지 않아도 인증을 실행한다', async () => {
    mockSend.mockResolvedValueOnce({ ok: true });
    mockVerify.mockResolvedValueOnce({ ok: true, verificationId: 'vid-auto' });
    const onVerified = vi.fn();
    const user = userEvent.setup();
    render(<PhoneVerificationField onVerified={onVerified} />);

    const otp = await enterOtpStep(user);
    await user.type(otp, '123456');

    await waitFor(() =>
      expect(mockVerify).toHaveBeenCalledWith({ phone: '010-1234-5678', code: '123456' }),
    );
    expect(onVerified).toHaveBeenCalledWith('010-1234-5678', 'vid-auto');
  });

  // 자동 재시도가 서버의 시도 횟수 제한을 사용자 모르게 소진시키면 안 된다.
  // 같은 코드를 다시 던지는 건 확인 버튼이라는 명시적 경로만 허용한다.
  it('틀린 코드를 지웠다 그대로 다시 넣어도 자동 재시도하지 않는다 (버튼은 동작)', async () => {
    mockSend.mockResolvedValueOnce({ ok: true });
    mockVerify.mockResolvedValue({ ok: false, error: 'INVALID_CODE' });
    const user = userEvent.setup();
    render(<PhoneVerificationField onVerified={vi.fn()} />);

    const otp = await enterOtpStep(user);
    await user.type(otp, '123456');
    await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(1));

    await user.type(otp, '{Backspace}6'); // 같은 코드로 되돌림
    expect(mockVerify).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(2));
  });

  it('재전송 후에는 같은 코드라도 다시 자동 제출한다', async () => {
    mockSend.mockResolvedValue({ ok: true });
    mockVerify.mockResolvedValue({ ok: false, error: 'INVALID_CODE' });
    const user = userEvent.setup();
    render(<PhoneVerificationField onVerified={vi.fn()} />);

    const otp = await enterOtpStep(user);
    await user.type(otp, '123456');
    await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: '재전송' }));
    await waitFor(() => expect(screen.getByLabelText('인증번호')).toHaveValue(''));
    await user.type(screen.getByLabelText('인증번호'), '123456');

    await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(2));
  });

  // 제출이 사용자 조작 없이 일어나므로, 진행 중임을 알리는 건 라이브 리전뿐이다.
  it('자동 제출이 진행 중임을 라이브 리전으로 알린다', async () => {
    let resolveVerify!: (v: unknown) => void;
    mockSend.mockResolvedValueOnce({ ok: true });
    mockVerify.mockImplementationOnce(
      () => new Promise((res) => { resolveVerify = res; }),
    );
    const user = userEvent.setup();
    render(<PhoneVerificationField onVerified={vi.fn()} />);

    const otp = await enterOtpStep(user);
    expect(screen.getByRole('status')).toHaveTextContent('');

    await user.type(otp, '123456');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('인증 중'));

    await act(async () => {
      resolveVerify({ ok: false, error: 'INVALID_CODE' });
    });
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  // 재전송이 진행 중인 동안에도 OTP 입력은 열려 있다(phone 입력만 disabled).
  // 그 틈에 자동 제출이 나가면 방금 폐기될 서버 행에 대고 시도 횟수를 태운다.
  it('재전송이 진행 중이면 자동 제출하지 않는다', async () => {
    let resolveResend!: (v: unknown) => void;
    mockSend
      .mockResolvedValueOnce({ ok: true })
      .mockImplementationOnce(() => new Promise((res) => { resolveResend = res; }));
    const user = userEvent.setup();
    render(<PhoneVerificationField onVerified={vi.fn()} />);

    const otp = await enterOtpStep(user);
    await user.click(screen.getByRole('button', { name: '재전송' }));

    await user.type(otp, '123456');
    expect(mockVerify).not.toHaveBeenCalled();

    await act(async () => {
      resolveResend({ ok: true });
    });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('실패 후 Enter로 같은 코드를 다시 시도할 수 있다', async () => {
    mockSend.mockResolvedValueOnce({ ok: true });
    mockVerify.mockResolvedValue({ ok: false, error: 'INVALID_CODE' });
    const user = userEvent.setup();
    render(<PhoneVerificationField onVerified={vi.fn()} />);

    const otp = await enterOtpStep(user);
    await user.type(otp, '123456');
    await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(1));

    await user.keyboard('{Enter}');

    await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(2));
  });

  // 이 입력은 가입 프로필 폼 안에 산다 — Enter 가 새면 프로필 전체가 제출된다.
  // 실제로 암묵 제출이 일어나도록 fixture 폼에 submit 버튼을 둔다.
  it('Enter는 부모 폼을 제출하지 않는다', async () => {
    mockSend.mockResolvedValueOnce({ ok: true });
    const formSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <form onSubmit={formSubmit}>
        <PhoneVerificationField onVerified={vi.fn()} />
        <button type="submit">폼제출</button>
      </form>,
    );

    await user.type(screen.getByLabelText('휴대전화'), '01012345678');
    await user.click(screen.getByRole('button', { name: '인증하기' }));

    // 5자리 — 자동 제출 사거리 밖이라 OTP 입력이 계속 마운트된 채로 Enter 를 받는다.
    await user.type(await screen.findByLabelText('인증번호'), '12345');
    await user.keyboard('{Enter}');

    expect(formSubmit).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('SMS OTP 칸은 one-time-code 자동완성을 붙인다', async () => {
    mockSend.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<PhoneVerificationField onVerified={vi.fn()} />);

    const otp = await enterOtpStep(user);
    expect(otp).toHaveAttribute('autocomplete', 'one-time-code');
  });

  // 클릭이 사라졌으니 실패를 알리는 건 라이브 리전뿐이다.
  it('인증번호 오류는 role=alert 로 알린다', async () => {
    mockSend.mockResolvedValueOnce({ ok: true });
    mockVerify.mockResolvedValueOnce({ ok: false, error: 'INVALID_CODE' });
    const user = userEvent.setup();
    render(<PhoneVerificationField onVerified={vi.fn()} />);

    const otp = await enterOtpStep(user);
    await user.type(otp, '123456');

    expect(await screen.findByRole('alert')).toHaveTextContent('인증번호가 올바르지 않습니다');
  });

  // MAX_ATTEMPTS 는 step 을 'input' 으로 되돌린다 — 안내 문구가 OTP 블록 안에 있으면
  // 같은 커밋에서 언마운트돼 사용자는 아무 설명 없이 입력칸만 사라진 화면을 본다.
  it('시도 횟수 초과 안내는 OTP 단계가 닫혀도 남는다', async () => {
    mockSend.mockResolvedValueOnce({ ok: true });
    mockVerify.mockResolvedValueOnce({ ok: false, error: 'MAX_ATTEMPTS' });
    const user = userEvent.setup();
    render(<PhoneVerificationField onVerified={vi.fn()} />);

    const otp = await enterOtpStep(user);
    await user.type(otp, '123456');

    expect(await screen.findByText(/시도 횟수를 초과/)).toBeInTheDocument();
    expect(screen.queryByLabelText('인증번호')).not.toBeInTheDocument();
  });

  it('OTP 입력이 6자리 미만이면 Enter가 verifyPhoneOtpAction을 호출하지 않는다', async () => {
    mockSend.mockResolvedValueOnce({ ok: true });
    const formSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <form onSubmit={formSubmit}>
        <PhoneVerificationField onVerified={vi.fn()} />
        <button type="submit">폼제출</button>
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
