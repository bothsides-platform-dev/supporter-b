import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from '../Footer';

vi.mock('@/lib/stores/theme', () => ({
  useThemeStore: (selector: (s: { resolvedTheme: string; setTheme: (t: string) => void }) => unknown) =>
    selector({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

describe('Footer', () => {
  it('renders theme toggle in the footer bottom row', () => {
    render(<Footer />);
    expect(screen.getByRole('button', { name: '다크 모드로 전환' })).toBeInTheDocument();
  });

  it('brand line renders the official name 서포트비', () => {
    render(<Footer />);
    expect(screen.getAllByText(/서포트비 CORP\./)).toHaveLength(2);
  });
});
