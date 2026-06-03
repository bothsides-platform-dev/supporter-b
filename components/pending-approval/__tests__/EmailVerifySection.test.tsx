/**
 * /pending-approval 의 이메일 인증 섹션 — 가입 후 서버 플래그 전환 방식.
 *   - 미인증 마운트 시 sendMyEmailVerificationAction 호출
 *   - 6자리 코드 입력 → verifyEmailCodeAction → 성공 시 ✓
 *   - 이미 인증된 경우 코드 입력 미표시
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

import { EmailVerifySection } from '../email-verify-section';

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

  it('코드 입력 후 제출 → verifyEmailCodeAction 성공 시 인증 완료 표시', async () => {
    mockVerifyCode.mockResolvedValue({ ok: true, email: 'me@x.com' });
    const user = userEvent.setup();
    render(<EmailVerifySection email="me@x.com" initialVerified={false} />);

    await user.type(screen.getByLabelText('인증 코드 (6자리)'), '123456');
    await user.click(screen.getByRole('button', { name: /코드로 인증하기/i }));

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
    await user.click(screen.getByRole('button', { name: /코드로 인증하기/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText(/인증 완료/)).not.toBeInTheDocument();
  });

  it('이미 인증된 경우: 코드 입력을 표시하지 않고 메일도 보내지 않는다', () => {
    render(<EmailVerifySection email="me@x.com" initialVerified={true} />);

    expect(screen.queryByLabelText('인증 코드 (6자리)')).not.toBeInTheDocument();
    expect(mockSend).not.toHaveBeenCalled();
    expect(screen.getByText(/인증 완료/)).toBeInTheDocument();
  });

  it('인증 성공 시 onVerified 콜백을 호출한다 (페이지가 기존 pending-approval 로 전환하도록)', async () => {
    mockVerifyCode.mockResolvedValue({ ok: true, email: 'me@x.com' });
    const onVerified = vi.fn();
    const user = userEvent.setup();
    render(<EmailVerifySection email="me@x.com" initialVerified={false} onVerified={onVerified} />);

    await user.type(screen.getByLabelText('인증 코드 (6자리)'), '123456');
    await user.click(screen.getByRole('button', { name: /코드로 인증하기/i }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
  });
});
