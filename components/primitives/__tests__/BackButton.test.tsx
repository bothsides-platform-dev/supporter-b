// BackButton — 풀페이지 상세에서 직전 위치(칸반·목록·검색)로 복귀.
//  - 히스토리가 있으면 router.back() (모달 닫기 동작을 모든 진입점에서 재현)
//  - 직접 URL 진입 등 히스토리가 없으면 fallback(/home)으로 push
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const back = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back, push }),
}));

import { BackButton } from '../BackButton';

function setHistoryLength(n: number) {
  Object.defineProperty(window.history, 'length', {
    value: n,
    configurable: true,
  });
}

afterEach(() => {
  cleanup();
  back.mockClear();
  push.mockClear();
});

describe('BackButton', () => {
  it('히스토리가 있으면 router.back() 을 호출하고 push 는 하지 않는다', async () => {
    const user = userEvent.setup();
    setHistoryLength(2);
    render(<BackButton />);
    await user.click(screen.getByRole('button', { name: /뒤로/ }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('히스토리가 없으면 /home 으로 push 하고 back 은 하지 않는다', async () => {
    const user = userEvent.setup();
    setHistoryLength(1);
    render(<BackButton />);
    await user.click(screen.getByRole('button', { name: /뒤로/ }));
    expect(push).toHaveBeenCalledWith('/home');
    expect(back).not.toHaveBeenCalled();
  });
});
