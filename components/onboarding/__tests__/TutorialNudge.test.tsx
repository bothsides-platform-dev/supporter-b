import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { TutorialNudge } from '../TutorialNudge';

afterEach(cleanup);

describe('TutorialNudge', () => {
  it('renders a link to /tutorial with a short resume message', () => {
    render(<TutorialNudge />);
    const link = screen.getByRole('link', { name: /3분 만에 서비스를 둘러보세요/ });
    expect(link).toHaveAttribute('href', '/tutorial');
  });

  it('has no dismiss/close button', () => {
    render(<TutorialNudge />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
