import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ApprovalWaitingScreen } from '@/components/pending-approval/approval-waiting-screen';

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
    span: ({ children, animate, style, className }: Record<string, unknown>) =>
      <span style={style as React.CSSProperties} className={className as string}>{children as React.ReactNode}</span>,
  },
  useAnimation: vi.fn(() => ({ start: animationStartMock })),
}));

beforeEach(() => {
  fireMock.mockClear();
  animationStartMock.mockClear();
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
});
