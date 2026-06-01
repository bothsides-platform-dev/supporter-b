import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { OnboardingActionList } from '../OnboardingActionList';
import type { OnboardingAction } from '@/lib/server/dashboard/buildDashboard';

afterEach(() => cleanup());

const actions: OnboardingAction[] = [
  { id: 'create-rfp',     href: '/rfp/new',          title: '첫 RFP를 작성해 보세요',  description: 'PG사를 초대하고 수수료 견적을 비교할 수 있어요' },
  { id: 'setup-profile',  href: '/settings/profile', title: '워크스페이스 프로필 설정', description: '' },
  { id: 'invite-members', href: '/settings/members', title: '팀원 초대하기',            description: '' },
];

describe('OnboardingActionList', () => {
  it('renders primary action as a banner with href /rfp/new', () => {
    render(<OnboardingActionList actions={actions} />);
    const banner = screen.getByRole('link', { name: /첫 RFP를 작성해 보세요/ });
    expect(banner).toHaveAttribute('href', '/rfp/new');
    expect(banner).toHaveTextContent('RFP 작성하기');
  });

  it('renders secondary actions as list items with correct hrefs', () => {
    render(<OnboardingActionList actions={actions} />);
    expect(screen.getByRole('link', { name: /워크스페이스 프로필 설정/ }))
      .toHaveAttribute('href', '/settings/profile');
    expect(screen.getByRole('link', { name: /팀원 초대하기/ }))
      .toHaveAttribute('href', '/settings/members');
  });

  it('renders nothing when actions array is empty', () => {
    const { container } = render(<OnboardingActionList actions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
