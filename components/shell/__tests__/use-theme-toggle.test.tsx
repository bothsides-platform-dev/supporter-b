import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useThemeToggle } from '../use-theme-toggle';

// 이 파일이 지키는 것: **리빌 원점**.
//
// 원형 테마 전환은 클릭한 지점에서 퍼져야 자연스럽다. 원점을 버튼 사각형에서
// 잡으면 사이드바 푸터 행(폭 ~184px)에서는 정작 누른 18px 아이콘에서 한참 떨어진
// 행 한가운데에서 퍼진다. 그래서 아이콘 기준으로 바꿨는데, 그 동작을 관찰하는
// 테스트가 어디에도 없었다 — 버튼 기준으로 되돌려도 전 스위트가 그린이었다.
// jsdom 은 레이아웃이 없어 모든 rect 가 0×0 이므로 rect 를 직접 심는다.

const mockApply = vi.fn();
vi.mock('@/lib/theme/view-transition', () => ({
  applyThemeWithTransition: (origin: { x: number; y: number }, apply: () => void) => {
    mockApply(origin);
    apply();
  },
}));

const mockSetTheme = vi.fn();
let mockResolvedTheme: 'light' | 'dark' = 'light';
vi.mock('@/lib/stores/theme', () => {
  type MockState = { resolvedTheme: 'light' | 'dark'; setTheme: (t: string) => void };
  const getState = (): MockState => ({
    resolvedTheme: mockResolvedTheme,
    setTheme: mockSetTheme,
  });
  const useThemeStore = Object.assign(
    (selector: (s: MockState) => unknown) => selector(getState()),
    { getState },
  );
  return { useThemeStore };
});

function stubRect(el: Element, rect: { x: number; y: number; width: number; height: number }) {
  el.getBoundingClientRect = () =>
    ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.y,
      left: rect.x,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      toJSON: () => ({}),
    }) as DOMRect;
}

/** 아이콘이 버튼 중심에서 **한참 벗어난** 행. 두 원점이 확실히 갈린다. */
function WideRow({ withIcon = true }: { withIcon?: boolean }) {
  const { toggleFrom } = useThemeToggle();
  return (
    <button
      type="button"
      data-testid="row"
      aria-label="토글"
      onClick={(e) => toggleFrom(e.currentTarget)}
    >
      {withIcon ? <svg data-testid="icon" /> : null}
      <span>라벨</span>
    </button>
  );
}

beforeEach(() => {
  mockApply.mockClear();
  mockSetTheme.mockClear();
  mockResolvedTheme = 'light';
});

describe('useThemeToggle — 리빌 원점', () => {
  it('버튼이 아니라 아이콘 중심에서 퍼진다', async () => {
    const user = userEvent.setup();
    render(<WideRow />);

    // 버튼은 0..184, 아이콘은 좌측 끝 10..28 — 중심이 92 vs 19 로 갈린다.
    stubRect(screen.getByTestId('row'), { x: 0, y: 700, width: 184, height: 32 });
    stubRect(screen.getByTestId('icon'), { x: 10, y: 707, width: 18, height: 18 });

    await user.click(screen.getByTestId('row'));

    expect(mockApply).toHaveBeenCalledWith({ x: 19, y: 716 });
  });

  it('아이콘이 없으면 버튼 중심으로 떨어진다', async () => {
    const user = userEvent.setup();
    render(<WideRow withIcon={false} />);

    stubRect(screen.getByTestId('row'), { x: 0, y: 700, width: 184, height: 32 });

    await user.click(screen.getByTestId('row'));

    expect(mockApply).toHaveBeenCalledWith({ x: 92, y: 716 });
  });
});

describe('useThemeToggle — 상태 전환', () => {
  it('라이트에서 누르면 다크로 바꾼다', async () => {
    const user = userEvent.setup();
    render(<WideRow />);
    await user.click(screen.getByTestId('row'));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('다크에서 누르면 라이트로 바꾼다', async () => {
    mockResolvedTheme = 'dark';
    const user = userEvent.setup();
    render(<WideRow />);
    await user.click(screen.getByTestId('row'));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });
});
