import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemberRow } from '../MemberRow';
import type { User } from '@/lib/types/user';

afterEach(() => cleanup());

const member: User = {
  id: 'u-7',
  name: '이멤버',
  email: 'm@m.com',
  avatarColor: 'ink',
  avatarUpdatedAt: '2026-06-21T00:00:00.000Z',
  role: 'member',
  status: 'active',
  emailVerified: true,
  joinedAt: '2026-06-01T00:00:00.000Z',
};

it('renders the member photo when avatarUpdatedAt is set', () => {
  render(
    <MemberRow
      member={member}
      isSelf={false}
      isAdmin={false}
      isMutating={false}
      onRoleChange={vi.fn()}
      onRemoveClick={vi.fn()}
    />,
  );
  const img = screen.getByRole('img');
  expect(img.tagName).toBe('IMG');
  expect(img).toHaveAttribute('src', `/api/user/u-7/avatar?v=${Date.parse('2026-06-21T00:00:00.000Z')}`);
});
