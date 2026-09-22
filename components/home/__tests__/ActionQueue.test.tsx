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

it('계약 할 일은 구매사·견적과 다음 행동이 있는 링크로 표시한다', () => {
  render(<ActionQueue groups={[{ id: 'agreements', label: '합의서를 보내야 해요', items: [
    { id: 'r1', title: '구매회사 · 첫 견적', href: '/inbox/P-1?tab=contract', badge: '', actionLabel: '이어서 작성하기' },
  ] }]} />);
  expect(screen.getByRole('link', { name: /구매회사 · 첫 견적.*이어서 작성하기/ })).toHaveAttribute('href', '/inbox/P-1?tab=contract');
});
