import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalWaitingScreen } from '@/components/pending-approval/approval-waiting-screen';

const { routerPushMock } = vi.hoisted(() => ({ routerPushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: vi.fn(() => ({ push: routerPushMock })) }));

const { approvalActionMock } = vi.hoisted(() => ({ approvalActionMock: vi.fn() }));
vi.mock('@/lib/server/actions/auth/checkMyWorkspaceApprovalAction', () => ({
  checkMyWorkspaceApprovalAction: approvalActionMock,
}));

const { fireMock } = vi.hoisted(() => {
  // canvas-confetti's create() returns a fire function that also carries .reset()
  const fn = Object.assign(vi.fn(), { reset: vi.fn() });
  return { fireMock: fn };
});

const { animationStartMock } = vi.hoisted(() => ({
  animationStartMock: vi.fn(),
}));

vi.mock('canvas-confetti', () => ({
  default: Object.assign(vi.fn(), {
    create: vi.fn(() => fireMock),
    reset: vi.fn(),
  }),
}));

vi.mock('motion/react', () => ({
  motion: {
    span: ({ children, style, className }: Record<string, unknown>) =>
      <span style={style as React.CSSProperties} className={className as string}>{children as React.ReactNode}</span>,
  },
  useAnimation: vi.fn(() => ({ start: animationStartMock })),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

beforeEach(() => {
  fireMock.mockClear();
  animationStartMock.mockClear();
  routerPushMock.mockClear();
  approvalActionMock.mockResolvedValue({ approved: false });
  // jsdom은 matchMedia를 미지원 — 모션 감소 없음으로 설정
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
});

afterEach(cleanup);

describe('ApprovalWaitingScreen', () => {
  it('환영 제목을 렌더한다', () => {
    render(<ApprovalWaitingScreen />);
    expect(screen.getByText('거의 다 왔어요!')).toBeInTheDocument();
  });

  it('심사 소요 칩과 채널톡 문의 안내를 렌더한다', () => {
    render(<ApprovalWaitingScreen />);
    expect(
      screen.getByText(/심사는 영업일 기준 2일 이내/),
    ).toBeInTheDocument();
    expect(screen.getByText(/채널톡/)).toBeInTheDocument();
  });

  it('접근 가능한 파티 꼬깔 버튼을 렌더한다', () => {
    render(<ApprovalWaitingScreen />);
    expect(
      screen.getByRole('button', { name: '축하 효과 다시 보기' }),
    ).toBeInTheDocument();
  });

  it('마운트 시 컨페티를 발사한다', () => {
    render(<ApprovalWaitingScreen />);
    // fire()는 내부적으로 3개 버스트(좌·우·중앙)를 한 번에 발사한다
    expect(fireMock).toHaveBeenCalledTimes(3);
  });

  it('꼬깔 버튼을 클릭하면 컨페티를 다시 발사한다', () => {
    render(<ApprovalWaitingScreen />);
    const callsAfterMount = fireMock.mock.calls.length; // 3
    fireEvent.click(
      screen.getByRole('button', { name: '축하 효과 다시 보기' }),
    );
    // 클릭 후 추가로 3버스트 발사됐는지 확인
    expect(fireMock).toHaveBeenCalledTimes(callsAfterMount + 3);
  });

  it('마운트 시 아이콘 셰이크 애니메이션을 시작한다', () => {
    render(<ApprovalWaitingScreen />);
    expect(animationStartMock).toHaveBeenCalledTimes(1);
  });

  it('꼬깔 버튼 클릭 시 아이콘 셰이크 애니메이션을 다시 시작한다', () => {
    render(<ApprovalWaitingScreen />);
    const callsAfterMount = animationStartMock.mock.calls.length;
    fireEvent.click(
      screen.getByRole('button', { name: '축하 효과 다시 보기' }),
    );
    expect(animationStartMock).toHaveBeenCalledTimes(callsAfterMount + 1);
  });

  it('홈으로 가기 링크가 /home으로 연결된다', () => {
    render(<ApprovalWaitingScreen />);
    const link = screen.getByRole('link', { name: '홈으로 가기' });
    expect(link).toHaveAttribute('href', '/home');
  });

  describe('승인 폴링', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('10초 경과 전에는 router.push를 호출하지 않는다', async () => {
      render(<ApprovalWaitingScreen />);
      await act(async () => { vi.advanceTimersByTime(9999); });
      expect(routerPushMock).not.toHaveBeenCalled();
    });

    it('approved=true 반환 시 router.push("/home")을 호출한다', async () => {
      approvalActionMock.mockResolvedValue({ approved: true });
      render(<ApprovalWaitingScreen />);
      await act(async () => { vi.advanceTimersByTime(10_000); });
      expect(routerPushMock).toHaveBeenCalledWith('/home');
    });

    it('approved=false 동안은 router.push를 호출하지 않는다', async () => {
      render(<ApprovalWaitingScreen />);
      await act(async () => { vi.advanceTimersByTime(30_000); });
      expect(routerPushMock).not.toHaveBeenCalled();
    });

    it('언마운트 후 승인이 와도 router.push를 호출하지 않는다', async () => {
      approvalActionMock.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ approved: true }), 5_000)),
      );
      const { unmount } = render(<ApprovalWaitingScreen />);
      await act(async () => { vi.advanceTimersByTime(10_000); });
      unmount();
      await act(async () => { vi.advanceTimersByTime(10_000); });
      expect(routerPushMock).not.toHaveBeenCalled();
    });
  });

  it('로그아웃 버튼 클릭 시 /logout POST 후 /login으로 이동한다', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign: assignMock }, writable: true });
    render(<ApprovalWaitingScreen />);
    await userEvent.setup().click(screen.getByRole('button', { name: '로그아웃' }));
    expect(fetchSpy).toHaveBeenCalledWith('/logout', { method: 'POST' });
    expect(assignMock).toHaveBeenCalledWith('/login');
    fetchSpy.mockRestore();
  });
});
