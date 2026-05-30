import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ApprovalWaitingScreen } from '@/components/pending-approval/approval-waiting-screen';

const { fireMock } = vi.hoisted(() => {
  // canvas-confetti's create() returns a fire function that also carries .reset()
  const fn = Object.assign(vi.fn(), { reset: vi.fn() });
  return { fireMock: fn };
});

vi.mock('canvas-confetti', () => ({
  default: Object.assign(vi.fn(), {
    create: vi.fn(() => fireMock),
    reset: vi.fn(),
  }),
}));

beforeEach(() => {
  fireMock.mockClear();
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
      screen.getByText(/심사는 최대 영업일 2일 이내/),
    ).toBeInTheDocument();
    expect(screen.getByText(/채널톡/)).toBeInTheDocument();
  });

  it('접근 가능한 파티 꼬깔 버튼을 렌더한다', () => {
    render(<ApprovalWaitingScreen />);
    expect(
      screen.getByRole('button', { name: '축하 효과 다시 보기' }),
    ).toBeInTheDocument();
  });

  it('마운트 시 컨페티를 한 번 발사한다', () => {
    render(<ApprovalWaitingScreen />);
    expect(fireMock).toHaveBeenCalledTimes(1);
  });

  it('꼬깔 버튼을 클릭하면 컨페티를 다시 발사한다', () => {
    render(<ApprovalWaitingScreen />);
    expect(fireMock).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: '축하 효과 다시 보기' }),
    );
    expect(fireMock).toHaveBeenCalledTimes(2);
  });
});
