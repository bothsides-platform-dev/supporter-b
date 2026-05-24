import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { KpiStrip } from '../KpiStrip';
import type { DashboardKpi } from '@/lib/server/dashboard/buildDashboard';

afterEach(() => cleanup());

const kpis: DashboardKpi[] = [
  { id: 'active', label: '진행중', value: 8, href: '/rfp?status=active' },
  { id: 'due', label: '마감 임박', value: 2, href: '/rfp?status=active&deadline=d7' },
];

describe('KpiStrip', () => {
  it('renders each KPI as a link with label and value', () => {
    render(<KpiStrip kpis={kpis} />);
    const active = screen.getByRole('link', { name: /진행중/ });
    expect(active).toHaveAttribute('href', '/rfp?status=active');
    expect(active).toHaveTextContent('8');
    expect(screen.getByRole('link', { name: /마감 임박/ })).toHaveAttribute(
      'href',
      '/rfp?status=active&deadline=d7',
    );
  });
});
