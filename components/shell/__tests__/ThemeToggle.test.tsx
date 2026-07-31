import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '../ThemeToggle';

const mockSetTheme = vi.fn();
let mockResolvedTheme: 'light' | 'dark' = 'light';

vi.mock('@/lib/stores/theme', () => {
  type MockState = { resolvedTheme: 'light' | 'dark'; setTheme: (t: string) => void };
  const getState = (): MockState => ({ resolvedTheme: mockResolvedTheme, setTheme: mockSetTheme });
  const useThemeStore = Object.assign(
    (selector: (s: MockState) => unknown) => selector(getState()),
    { getState },
  );
  return { useThemeStore };
});

describe('ThemeToggle', () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
    mockResolvedTheme = 'light';
  });

  it('shows MoonIcon and aria-label "다크 모드로 전환" when resolvedTheme is light', () => {
    mockResolvedTheme = 'light';
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: '다크 모드로 전환' })).toBeInTheDocument();
  });

  it('shows SunIcon and aria-label "라이트 모드로 전환" when resolvedTheme is dark', () => {
    mockResolvedTheme = 'dark';
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: '라이트 모드로 전환' })).toBeInTheDocument();
  });

  it('calls setTheme("dark") when clicked in light mode', async () => {
    const user = userEvent.setup();
    mockResolvedTheme = 'light';
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: '다크 모드로 전환' }));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('calls setTheme("light") when clicked in dark mode', async () => {
    const user = userEvent.setup();
    mockResolvedTheme = 'dark';
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: '라이트 모드로 전환' }));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  // 이 컴포넌트가 사이드바 푸터 행과 따로 남아 있는 유일한 이유가 모양이다 —
  // 랜딩·공개 푸터(shell/Footer)에서는 저작권 표시 옆 정사각 아이콘 버튼이어야
  // 한다. 그 계약을 아무것도 못박고 있지 않아서, "행 컴포넌트 재사용하자" 리팩터가
  // 들어오면 랜딩 푸터가 조용히 깨진다.
  it('stays a square icon button, not a full-width labeled row', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: '다크 모드로 전환' });

    expect(button.className).toMatch(/\bw-8\b/);
    expect(button.className).toMatch(/\bh-8\b/);
    expect(button.className).not.toMatch(/\bw-full\b/);
    expect(button.className).not.toMatch(/\bjustify-between\b/);
    // 보이는 텍스트 라벨이 없다 — 이름은 aria-label 로만 붙는다.
    expect(button).toHaveTextContent('');
  });
});

