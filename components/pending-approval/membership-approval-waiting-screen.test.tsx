import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MembershipApprovalWaitingScreen } from '@/components/pending-approval/membership-approval-waiting-screen';
import { checkMyMembershipApprovalAction } from '@/lib/server/actions/auth/checkMyMembershipApprovalAction';

const { approvalActionMock } = vi.hoisted(() => ({ approvalActionMock: vi.fn() }));
vi.mock('@/lib/server/actions/auth/checkMyMembershipApprovalAction', () => ({
  checkMyMembershipApprovalAction: approvalActionMock,
}));

const { animationStartMock } = vi.hoisted(() => ({
  animationStartMock: vi.fn(),
}));

vi.mock('motion/react', () => ({
  motion: {
    span: ({ children, style, className }: Record<string, unknown>) =>
      <span style={style as React.CSSProperties} className={className as string}>{children as React.ReactNode}</span>,
  },
  useAnimation: vi.fn(() => ({ start: animationStartMock })),
}));

beforeEach(() => {
  animationStartMock.mockClear();
  approvalActionMock.mockResolvedValue({ status: 'pending_approval' });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
});

afterEach(cleanup);

describe('MembershipApprovalWaitingScreen', () => {
  it('심사 대기 제목을 렌더한다', () => {
    render(<MembershipApprovalWaitingScreen />);
    expect(screen.getByText('담당자 계정 심사 중이에요')).toBeInTheDocument();
  });

  it('심사 소요 칩과 채널톡 문의 안내를 렌더한다', () => {
    render(<MembershipApprovalWaitingScreen />);
    expect(screen.getByText(/심사는 영업일 기준 2일 이내/)).toBeInTheDocument();
    expect(screen.getByText(/채널톡/)).toBeInTheDocument();
  });

  it('로그아웃 버튼이 있다', () => {
    render(<MembershipApprovalWaitingScreen />);
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
  });

  it('로그아웃 버튼 클릭 시 /logout으로 이동한다', async () => {
    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign: assignMock }, writable: true });
    render(<MembershipApprovalWaitingScreen />);
    await userEvent.setup().click(screen.getByRole('button', { name: '로그아웃' }));
    expect(assignMock).toHaveBeenCalledWith('/logout');
  });

  it('마운트 시 아이콘 셰이크 애니메이션을 시작한다', () => {
    render(<MembershipApprovalWaitingScreen />);
    expect(animationStartMock).toHaveBeenCalledTimes(1);
  });

  describe('승인 폴링', () => {
    let assignMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();
      assignMock = vi.fn();
      Object.defineProperty(window, 'location', { value: { assign: assignMock }, writable: true });
    });

    afterEach(() => vi.useRealTimers());

    it('10초 경과 전에는 window.location.assign을 호출하지 않는다', async () => {
      render(<MembershipApprovalWaitingScreen />);
      await act(async () => { vi.advanceTimersByTime(9999); });
      expect(assignMock).not.toHaveBeenCalled();
    });

    it('status=approved 반환 시 window.location.assign("/home")을 호출한다', async () => {
      approvalActionMock.mockResolvedValue({ status: 'approved' });
      render(<MembershipApprovalWaitingScreen />);
      await act(async () => { vi.advanceTimersByTime(10_000); });
      expect(assignMock).toHaveBeenCalledWith('/home');
    });

    it('status=pending_approval 동안은 window.location.assign을 호출하지 않는다', async () => {
      render(<MembershipApprovalWaitingScreen />);
      await act(async () => { vi.advanceTimersByTime(30_000); });
      expect(assignMock).not.toHaveBeenCalled();
    });

    it('rejected 상태 반환 시 거부 메시지를 렌더한다', async () => {
      approvalActionMock.mockResolvedValue({ status: 'rejected' });
      render(<MembershipApprovalWaitingScreen />);
      await act(async () => { vi.advanceTimersByTime(10_000); });
      expect(screen.getByText('담당자 계정 합류 요청이 거부됐어요')).toBeInTheDocument();
    });
  });
});
