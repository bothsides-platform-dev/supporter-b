/**
 * EmailVerifyScreen — /pending-approval 이 미인증 유저에게 보여주는 인증 전용 화면.
 * 인증되면 router.refresh() 로 기존 pending-approval(심사 대기) 화면으로 전환.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

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
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { EmailVerifyScreen } from '../email-verify-screen';

describe('EmailVerifyScreen', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockSend.mockReset().mockResolvedValue({ ok: true });
    mockCheck.mockReset().mockResolvedValue({ verified: false });
    mockVerifyCode.mockReset();
  });

  it('인증 안내 제목과 코드 입력을 보여준다', () => {
    render(<EmailVerifyScreen email="me@x.com" />);
    expect(screen.getByText('이메일을 인증해 주세요')).toBeInTheDocument();
    expect(screen.getByLabelText('인증 코드 (6자리)')).toBeInTheDocument();
  });

  it('코드 인증 성공 시 router.refresh()로 기존 pending-approval 화면으로 전환', async () => {
    mockVerifyCode.mockResolvedValue({ ok: true, email: 'me@x.com' });
    const user = userEvent.setup();
    render(<EmailVerifyScreen email="me@x.com" />);

    await user.type(screen.getByLabelText('인증 코드 (6자리)'), '123456');
    await user.click(screen.getByRole('button', { name: /코드로 인증하기/i }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('홈으로 가기 링크가 루트로 연결된다', () => {
    render(<EmailVerifyScreen email="me@x.com" />);
    const link = screen.getByRole('link', { name: '홈으로 가기' });
    expect(link).toHaveAttribute('href', '/');
  });

  it('로그아웃 버튼 클릭 시 /logout POST 후 /login으로 이동한다', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign: assignMock }, writable: true });
    render(<EmailVerifyScreen email="me@x.com" />);
    await userEvent.setup().click(screen.getByRole('button', { name: '로그아웃' }));
    expect(fetchSpy).toHaveBeenCalledWith('/logout', { method: 'POST' });
    expect(assignMock).toHaveBeenCalledWith('/login');
    fetchSpy.mockRestore();
  });
});
