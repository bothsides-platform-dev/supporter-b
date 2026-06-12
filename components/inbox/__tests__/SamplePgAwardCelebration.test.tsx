import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { routerPushMock } = vi.hoisted(() => ({ routerPushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: vi.fn(() => ({ push: routerPushMock })) }));

const { fireMock } = vi.hoisted(() => {
  const fn = Object.assign(vi.fn(), { reset: vi.fn() });
  return { fireMock: fn };
});
vi.mock('canvas-confetti', () => ({
  default: Object.assign(vi.fn(), { create: vi.fn(() => fireMock), reset: vi.fn() }),
}));
vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, style, className }: Record<string, unknown>) => (
          <div style={style as React.CSSProperties} className={className as string}>
            {children as React.ReactNode}
          </div>
        ),
    },
  ),
}));

import { SamplePgAwardCelebration } from '../SamplePgAwardCelebration';

afterEach(() => {
  cleanup();
  routerPushMock.mockClear();
});

describe('SamplePgAwardCelebration', () => {
  it('선정 축하 메시지와 구매사명을 보여준다', () => {
    render(<SamplePgAwardCelebration buyerName="샘플 쇼핑몰" />);
    expect(screen.getByText('견적이 선정됐어요')).toBeInTheDocument();
    expect(screen.getByText(/샘플 쇼핑몰/)).toBeInTheDocument();
  });

  it('CTA 클릭 시 인박스로 이동한다', async () => {
    const user = userEvent.setup();
    render(<SamplePgAwardCelebration buyerName="샘플 쇼핑몰" />);
    await user.click(screen.getByRole('button', { name: '둘러보기 끝내기' }));
    expect(routerPushMock).toHaveBeenCalledWith('/inbox');
  });
});
