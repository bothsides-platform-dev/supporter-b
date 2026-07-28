/**
 * /pending-approval 의 이메일 인증 섹션 — 가입 후 서버 플래그 전환 방식.
 *   - 미인증 마운트 시 sendMyEmailVerificationAction 호출
 *   - 6자리 코드 입력 → verifyEmailCodeAction → 성공 시 ✓
 *   - 이미 인증된 경우 코드 입력 미표시
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockSend = vi.fn();
const mockCheck = vi.fn();
vi.mock('@/lib/server/actions/auth', () => ({
  sendMyEmailVerificationAction: (...a: unknown[]) => mockSend(...a),
  checkMyEmailVerifiedAction: (...a: unknown[]) => mockCheck(...a),
}));

const mockVerifyCode = vi.fn();
vi.mock('@/lib/server/actions/auth/verifyEmailCodeAction', () => ({
  verifyEmailCodeAction: (...a: unknown[]) => mockVerifyCode(...a),
}));

import { EmailVerifySection } from '../EmailVerifySection';

describe('EmailVerifySection', () => {
  beforeEach(() => {
    mockSend.mockReset().mockResolvedValue({ ok: true });
    mockCheck.mockReset().mockResolvedValue({ verified: false });
    mockVerifyCode.mockReset();
  });

  it('미인증: 마운트 시 인증 메일을 보내고 코드 입력을 표시한다', async () => {
    render(<EmailVerifySection email="me@x.com" initialVerified={false} />);

    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    expect(screen.getByLabelText('인증 코드 (6자리)')).toBeInTheDocument();
  });

  it('코드 6자리 입력 → 버튼 없이 자동 제출되고 성공 시 인증 완료 표시', async () => {
    mockVerifyCode.mockResolvedValue({ ok: true, email: 'me@x.com' });
    const user = userEvent.setup();
    render(<EmailVerifySection email="me@x.com" initialVerified={false} />);

    await user.type(screen.getByLabelText('인증 코드 (6자리)'), '123456');

    await waitFor(() =>
      expect(mockVerifyCode).toHaveBeenCalledWith({ email: 'me@x.com', code: '123456' }),
    );
    await waitFor(() => expect(screen.getByText(/인증 완료/)).toBeInTheDocument());
  });

  it('틀린 코드는 에러를 표시하고 인증 완료로 넘어가지 않는다', async () => {
    mockVerifyCode.mockResolvedValue({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });
    const user = userEvent.setup();
    render(<EmailVerifySection email="me@x.com" initialVerified={false} />);

    await user.type(screen.getByLabelText('인증 코드 (6자리)'), '000000');

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText(/인증 완료/)).not.toBeInTheDocument();
  });

  // 자동 재시도가 서버의 시도 횟수 제한을 사용자 모르게 소진시키면 안 된다.
  // 같은 코드를 다시 던지는 건 버튼이라는 명시적 경로만 허용한다.
  it('틀린 코드를 지웠다 그대로 다시 넣어도 자동 재시도하지 않는다 (버튼은 동작)', async () => {
    mockVerifyCode.mockResolvedValue({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });
    const user = userEvent.setup();
    render(<EmailVerifySection email="me@x.com" initialVerified={false} />);

    const input = screen.getByLabelText('인증 코드 (6자리)');
    await user.type(input, '000000');
    await waitFor(() => expect(mockVerifyCode).toHaveBeenCalledTimes(1));

    await user.type(input, '{Backspace}0'); // 같은 코드로 되돌림
    expect(mockVerifyCode).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /코드로 인증하기/i }));
    await waitFor(() => expect(mockVerifyCode).toHaveBeenCalledTimes(2));
  });

  // 자동 제출이 진행 중일 때 도착한 코드가 조용히 삼켜지면 안 된다 — 사용자는
  // 6자리를 다 넣었는데 아무 일도 안 일어나는 상태로 남는다.
  it('제출 중 코드를 고치면 진행 중인 제출이 끝난 뒤 새 코드로 자동 제출한다', async () => {
    let resolveFirst!: (v: unknown) => void;
    mockVerifyCode
      .mockImplementationOnce(() => new Promise((res) => { resolveFirst = res; }))
      .mockResolvedValue({ ok: true, email: 'me@x.com' });
    const user = userEvent.setup();
    render(<EmailVerifySection email="me@x.com" initialVerified={false} />);

    const input = screen.getByLabelText('인증 코드 (6자리)');
    await user.type(input, '111111');
    await waitFor(() => expect(mockVerifyCode).toHaveBeenCalledTimes(1));

    // 첫 제출이 끝나기 전에 마지막 자리를 고쳐 새 코드를 만든다
    await user.type(input, '{Backspace}2');
    expect(mockVerifyCode).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });
    });

    await waitFor(() =>
      expect(mockVerifyCode).toHaveBeenLastCalledWith({ email: 'me@x.com', code: '111112' }),
    );
  });

  it('이미 인증된 경우: 코드 입력을 표시하지 않고 메일도 보내지 않는다', () => {
    render(<EmailVerifySection email="me@x.com" initialVerified={true} />);

    expect(screen.queryByLabelText('인증 코드 (6자리)')).not.toBeInTheDocument();
    expect(mockSend).not.toHaveBeenCalled();
    expect(screen.getByText(/인증 완료/)).toBeInTheDocument();
  });

  it('재발송 버튼: {resend:true}로 호출하고 발송 후 쿨다운으로 버튼을 비활성화한다', async () => {
    const user = userEvent.setup();
    render(<EmailVerifySection email="me@x.com" initialVerified={false} />);

    // 마운트 자동 발송 (인자 없음) 이후, 명시적 재발송만 따로 검증
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    mockSend.mockClear();

    await user.click(screen.getByRole('button', { name: /다시 보내기/ }));

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith({ resend: true });
      expect(screen.getByText('메일을 다시 보냈어요')).toBeInTheDocument();
    });
    // 쿨다운 중에는 재발송 버튼이 비활성
    expect(
      screen.getByRole('button', { name: /다시 보낼 수 있어요/ }),
    ).toBeDisabled();
  });

  // 제출이 사용자 조작 없이 일어나므로, 진행 중임을 알리는 건 라이브 리전뿐이다.
  it('자동 제출이 진행 중임을 라이브 리전으로 알린다', async () => {
    let resolveVerify!: (v: unknown) => void;
    mockVerifyCode.mockImplementationOnce(
      () => new Promise((res) => { resolveVerify = res; }),
    );
    const user = userEvent.setup();
    render(<EmailVerifySection email="me@x.com" initialVerified={false} />);

    expect(screen.getByRole('status')).toHaveTextContent('');

    await user.type(screen.getByLabelText('인증 코드 (6자리)'), '123456');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('인증 중'));

    await act(async () => {
      resolveVerify({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });
    });
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  // 재발송은 서버 코드를 갈아치운다 — 입력칸에 남은 이전 코드는 이미 무효다.
  // 비우지 않으면 버튼이 활성인 채로 남아 폐기된 코드를 다시 던지게 된다.
  it('재발송하면 입력칸을 비워 폐기된 코드가 다시 제출되지 않는다', async () => {
    mockVerifyCode.mockResolvedValue({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });
    const user = userEvent.setup();
    render(<EmailVerifySection email="me@x.com" initialVerified={false} />);

    const input = screen.getByLabelText('인증 코드 (6자리)');
    await user.type(input, '000000');
    await waitFor(() => expect(mockVerifyCode).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /다시 보내기/ }));

    await waitFor(() => expect(input).toHaveValue(''));
    expect(mockVerifyCode).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /코드로 인증하기/i })).toBeDisabled();
  });

  it('재발송 후에는 같은 코드라도 다시 자동 제출한다', async () => {
    mockVerifyCode.mockResolvedValue({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });
    const user = userEvent.setup();
    render(<EmailVerifySection email="me@x.com" initialVerified={false} />);

    const input = screen.getByLabelText('인증 코드 (6자리)');
    await user.type(input, '000000');
    await waitFor(() => expect(mockVerifyCode).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /다시 보내기/ }));
    await waitFor(() => expect(input).toHaveValue(''));
    await user.type(input, '000000'); // 새 메일의 코드가 우연히 같은 경우

    await waitFor(() => expect(mockVerifyCode).toHaveBeenCalledTimes(2));
  });

  // 액션이 reject 되면(모바일 네트워크 끊김, 배포 중 action-id 불일치) submitting 이
  // true 로 굳는다. 자동 제출은 submitting 을 게이트로 쓰므로 화면이 통째로 죽고,
  // 라이브 리전은 '인증 중이에요' 에 붙박이며, 오류 문구는 끝내 뜨지 않는다.
  it('액션이 throw 해도 무한 로딩에 빠지지 않고 오류를 표시한다', async () => {
    mockVerifyCode.mockRejectedValueOnce(new Error('network'));
    const user = userEvent.setup();
    render(<EmailVerifySection email="me@x.com" initialVerified={false} />);

    await user.type(screen.getByLabelText('인증 코드 (6자리)'), '123456');

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(screen.getByRole('button', { name: /코드로 인증하기/i })).toBeEnabled();
  });

  // 재발송은 입력칸을 먼저 비운다(폐기된 코드 재제출 방지). 그러니 발송이 실패하면
  // 사용자는 입력을 잃은 채 아무것도 통보받지 못하고, 오지 않을 메일을 기다린다.
  // 실패 두 갈래를 모두 알려야 한다: 액션이 ok:false 를 돌려주는 경우와 throw 하는 경우.
  it('재발송이 ok:false 로 실패하면 성공 문구 대신 오류를 알린다', async () => {
    mockSend.mockResolvedValueOnce({ ok: true }); // 마운트 시 1회 발송
    mockSend.mockResolvedValueOnce({ ok: false, error: 'UNAUTHENTICATED' });
    const user = userEvent.setup();
    render(<EmailVerifySection email="me@x.com" initialVerified={false} />);

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: /다시 보내기/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText('메일을 다시 보냈어요')).not.toBeInTheDocument();
    // 쿨다운을 걸면 실패했는데도 30초간 재시도를 막는다.
    expect(screen.getByRole('button', { name: /다시 보내기/ })).toBeEnabled();
  });

  it('재발송이 throw 하면 오류를 알리고 지웠던 코드를 되돌린다', async () => {
    mockVerifyCode.mockResolvedValue({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });
    mockSend.mockResolvedValueOnce({ ok: true }); // 마운트 시 1회 발송
    mockSend.mockRejectedValueOnce(new Error('network'));
    const user = userEvent.setup();
    render(<EmailVerifySection email="me@x.com" initialVerified={false} />);

    const input = screen.getByLabelText('인증 코드 (6자리)');
    await user.type(input, '000000');
    await waitFor(() => expect(mockVerifyCode).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /다시 보내기/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    // 서버 코드는 갈리지 않았으니 사용자가 손에 든 코드는 아직 유효하다.
    await waitFor(() => expect(input).toHaveValue('000000'));
    expect(screen.queryByText('메일을 다시 보냈어요')).not.toBeInTheDocument();
    // 되돌린 코드로 자동 재제출이 일어나면 시도 횟수를 사용자 모르게 태운다.
    expect(mockVerifyCode).toHaveBeenCalledTimes(1);
  });

  // one-time-code 자동완성은 iOS 에서 SMS 코드를 제안한다. 가입 프로필 단계에서
  // 방금 받은 휴대전화 OTP 가 몇 분간 제안 목록에 남아 있는데 이 화면은 그 직후라,
  // 잘못 탭하면 자동 제출이 바로 나가 시도 횟수를 태운다. 메일 코드 칸에는 붙이지 않는다.
  it('이메일 코드 칸에는 one-time-code 자동완성을 붙이지 않는다 (SMS 코드 오입력 방지)', () => {
    render(<EmailVerifySection email="me@x.com" initialVerified={false} />);

    expect(screen.getByLabelText('인증 코드 (6자리)')).not.toHaveAttribute(
      'autocomplete',
      'one-time-code',
    );
  });

  it('인증 성공 시 onVerified 콜백을 호출한다 (페이지가 기존 pending-approval 로 전환하도록)', async () => {
    mockVerifyCode.mockResolvedValue({ ok: true, email: 'me@x.com' });
    const onVerified = vi.fn();
    const user = userEvent.setup();
    render(<EmailVerifySection email="me@x.com" initialVerified={false} onVerified={onVerified} />);

    await user.type(screen.getByLabelText('인증 코드 (6자리)'), '123456');

    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
  });
});
