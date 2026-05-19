import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '../ThemeToggle';

const mockSetTheme = vi.fn();
let mockResolvedTheme: 'light' | 'dark' = 'light';

vi.mock('@/lib/stores/theme', () => ({
  useThemeStore: (selector: (s: { resolvedTheme: string; setTheme: (t: string) => void }) => unknown) =>
    selector({ resolvedTheme: mockResolvedTheme, setTheme: mockSetTheme }),
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
    mockResolvedTheme = 'light';
  });

  it('shows MoonIcon and aria-label "다크 모드로 전환" when resolvedTheme is light', () => {
    mockResolvedTheme = 'light';
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: '다크 모드로 전환' });
    expect(btn).toBeInTheDocument();
  });

  it('shows SunIcon and aria-label "라이트 모드로 전환" when resolvedTheme is dark', () => {
    mockResolvedTheme = 'dark';
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: '라이트 모드로 전환' });
    expect(btn).toBeInTheDocument();
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
});
