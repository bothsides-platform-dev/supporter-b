import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { RefreshHeaderButton } from '../header/RefreshHeaderButton';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function renderButton(overrides: Partial<React.ComponentProps<typeof RefreshHeaderButton>> = {}) {
  const defaults = {
    onRefresh: vi.fn(),
    lastRefreshedAt: new Date(),
    isRefreshing: false,
  };
  return render(<RefreshHeaderButton {...defaults} {...overrides} />);
}

describe('RefreshHeaderButton', () => {
  it('lastRefreshedAt이 현재 시간이면 "방금 전"을 보인다', () => {
    renderButton({ lastRefreshedAt: new Date() });
    expect(screen.getByRole('button', { name: /방금 전/ })).toBeInTheDocument();
  });

  it('30초 전 새로고침 → "방금 전"', () => {
    const t = new Date(Date.now() - 30_000);
    renderButton({ lastRefreshedAt: t });
    expect(screen.getByRole('button', { name: /방금 전/ })).toBeInTheDocument();
  });

  it('5분 전 새로고침 → "5분 전"', () => {
    const t = new Date(Date.now() - 5 * 60_000);
    renderButton({ lastRefreshedAt: t });
    expect(screen.getByRole('button', { name: /5분 전/ })).toBeInTheDocument();
  });

  it('61분 전 새로고침 → "1시간 전"', () => {
    const t = new Date(Date.now() - 61 * 60_000);
    renderButton({ lastRefreshedAt: t });
    expect(screen.getByRole('button', { name: /1시간 전/ })).toBeInTheDocument();
  });

  it('isRefreshing=true 이면 버튼이 disabled', () => {
    renderButton({ isRefreshing: true, lastRefreshedAt: new Date() });
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('클릭 시 onRefresh가 호출된다', () => {
    const onRefresh = vi.fn();
    renderButton({ onRefresh });
    fireEvent.click(screen.getByRole('button'));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('정확히 60분 전 새로고침 → "1시간 전" (경계값)', () => {
    const t = new Date(Date.now() - 60 * 60_000);
    renderButton({ lastRefreshedAt: t });
    expect(screen.getByRole('button', { name: /1시간 전/ })).toBeInTheDocument();
  });

  it('클릭 시 아이콘에 animate-spin-once 클래스가 추가된다', () => {
    const { container } = renderButton();
    const icon = container.querySelector('svg');

    fireEvent.click(screen.getByRole('button'));

    expect(icon).toHaveClass('animate-spin-once');
  });

  it('600ms 후 animate-spin-once 클래스가 제거된다', () => {
    const { container } = renderButton();
    const icon = container.querySelector('svg')!;

    fireEvent.click(screen.getByRole('button'));
    expect(icon).toHaveClass('animate-spin-once');

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(icon).not.toHaveClass('animate-spin-once');
  });

  it('60초 경과 후 레이블이 자동으로 업데이트된다', () => {
    const t = new Date(Date.now() - 30_000);
    renderButton({ lastRefreshedAt: t });
    expect(screen.getByRole('button', { name: /방금 전/ })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByRole('button', { name: /1분 전/ })).toBeInTheDocument();
  });
});
