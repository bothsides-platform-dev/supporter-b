import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { ActionQueue } from '../ActionQueue';
import type { ActionGroup } from '@/lib/server/dashboard/buildDashboard';

afterEach(() => cleanup());

const groups: ActionGroup[] = [
  { id: 'due', label: '마감 임박', items: [
    { id: 'P-A', href: '/rfp/P-A', title: 'A 제안요청', badge: 'D-3' },
  ] },
  { id: 'review', label: '응답 도착·검토대기', items: [
    { id: 'P-B', href: '/rfp/P-B', title: 'B 제안요청', badge: '응답 2건' },
  ] },
];

describe('ActionQueue', () => {
  it('renders each group label and its items as links with title + badge', () => {
    render(<ActionQueue groups={groups} />);
    expect(screen.getByText('마감 임박')).toBeInTheDocument();
    const a = screen.getByRole('link', { name: /A 제안요청/ });
    expect(a).toHaveAttribute('href', '/rfp/P-A');
    expect(a).toHaveTextContent('D-3');
    const b = screen.getByRole('link', { name: /B 제안요청/ });
    expect(b).toHaveTextContent('응답 2건');
  });
});
