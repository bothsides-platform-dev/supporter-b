import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const routerPushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPushMock }) }));

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

import { SamplePgResultScreen } from '../SamplePgResultScreen';

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

// jsdom 의 window.location.assign 은 "not implemented" 를 던지므로 스텁으로 교체.
// 인터셉트 모달 컨텍스트에서 router.push 는 @modal 슬롯을 pop 하지 못해 하드 내비를 쓴다.
const locationAssignMock = vi.fn();
beforeEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign: locationAssignMock },
  });
});

afterEach(() => {
  cleanup();
  routerPushMock.mockClear();
  locationAssignMock.mockClear();
});

describe('SamplePgResultScreen', () => {
  it('샘플 체험 완료 프레이밍과 봉인입찰 안내 문구를 보여준다', () => {
    render(<SamplePgResultScreen buyerName="샘플 쇼핑몰" />);
    expect(screen.getByText('샘플 체험 완료')).toBeInTheDocument();
    expect(
      screen.getByText('다른 PG의 견적과 참여 수는 서로 공개되지 않아요'),
    ).toBeInTheDocument();
  });

  it("CTA 클릭 시 하드 내비게이션으로 '/inbox'에 복귀한다 (인터셉트 모달 pop + 카드 상태 재조회)", async () => {
    const user = userEvent.setup();
    render(<SamplePgResultScreen buyerName="샘플 쇼핑몰" />);
    await user.click(screen.getByRole('button', { name: '받은 요청으로 돌아가기' }));
    expect(locationAssignMock).toHaveBeenCalledWith('/inbox');
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});
