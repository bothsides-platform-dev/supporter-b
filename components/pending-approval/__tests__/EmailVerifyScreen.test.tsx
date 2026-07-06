/**
 * EmailVerifyScreen — /pending-approval 이 미인증 유저에게 보여주는 인증 전용 화면.
 * 인증되면 /home 으로 하드 내비게이션(window.location.assign)해 (app) 가드가 워크스페이스
 * 상태로 재분기하게 한다 (active=정규 PG → 앱 진입, pending=buyer → 심사 대기 화면).
 * 소프트 내비(router.push/refresh)는 cross-host redirect 를 RSC fetch 로 따라가다 CORS 에
 * 막히고, refresh 면 active 유저가 잘못된 "심사 대기" 화면에 머물러 둘 다 쓰지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const assignMock = vi.fn();

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

import { EmailVerifyScreen } from '../EmailVerifyScreen';

describe('EmailVerifyScreen', () => {
  beforeEach(() => {
    assignMock.mockReset();
    Object.defineProperty(window, 'location', { value: { assign: assignMock }, writable: true });
    mockSend.mockReset().mockResolvedValue({ ok: true });
    mockCheck.mockReset().mockResolvedValue({ verified: false });
    mockVerifyCode.mockReset();
  });

  it('인증 안내 제목과 코드 입력을 보여준다', () => {
    render(<EmailVerifyScreen email="me@x.com" />);
    expect(screen.getByText('이메일을 인증해 주세요')).toBeInTheDocument();
    expect(screen.getByLabelText('인증 코드 (6자리)')).toBeInTheDocument();
  });

  it('코드 인증 성공 시 /home 으로 하드 내비게이션한다 ((app) 가드가 상태로 재분기)', async () => {
    mockVerifyCode.mockResolvedValue({ ok: true, email: 'me@x.com' });
    const user = userEvent.setup();
    render(<EmailVerifyScreen email="me@x.com" />);

    await user.type(screen.getByLabelText('인증 코드 (6자리)'), '123456');
    await user.click(screen.getByRole('button', { name: /코드로 인증하기/i }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith('/home'));
  });

  it('다른 탭/기기에서 링크 인증 시(폴링 감지) 도 /home 으로 하드 내비게이션한다', async () => {
    // 4초 폴링 인터벌을 결정적으로 진행하기 위해 fake timer 사용.
    vi.useFakeTimers();
    try {
      mockCheck.mockResolvedValue({ verified: true });
      render(<EmailVerifyScreen email="me@x.com" />);

      // act 로 감싸 폴링 콜백의 비동기 상태 갱신(setVerified)과 그에 따른
      // onVerified useEffect 재실행을 모두 flush 한다.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4100);
      });

      expect(assignMock).toHaveBeenCalledWith('/home');
    } finally {
      vi.useRealTimers();
    }
  });

  it('홈으로 가기 링크가 루트로 연결된다', () => {
    render(<EmailVerifyScreen email="me@x.com" />);
    const link = screen.getByRole('link', { name: '홈으로 가기' });
    expect(link).toHaveAttribute('href', '/');
  });

  it('로그아웃 버튼 클릭 시 GET /logout 으로 이동한다', async () => {
    render(<EmailVerifyScreen email="me@x.com" />);
    await userEvent.setup().click(screen.getByRole('button', { name: '로그아웃' }));
    expect(assignMock).toHaveBeenCalledWith('/logout');
  });
});
