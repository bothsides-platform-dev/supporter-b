import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { User } from '@/lib/types/user';

// MemberRow now renders the member avatar as a UserProfileCard trigger. That pulls
// in (at import time) getUserProfileAction + MessageComposeSheet's 'use server'
// chain (next-auth/DB, jsdom-unsafe) and useUserPresence — mock them all so the
// row imports/renders cleanly (mirrors CounterpartyProfileCard.test's mock set).
vi.mock('@/lib/server/actions/user/getUserProfileAction', () => ({
  getUserProfileAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/chat/sendChatMessageAction', () => ({
  sendChatMessageAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/chat/listTemplatesAction', () => ({
  listTemplatesAction: vi.fn().mockResolvedValue({ ok: true, templates: [] }),
}));
vi.mock('@/lib/server/actions/chat/saveTemplateAction', () => ({
  saveTemplateAction: vi.fn(),
}));
vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }));
vi.mock('@/components/presence/WorkspacePresenceProvider', () => ({
  useUserPresence: () => false,
}));

import { MemberRow } from '../MemberRow';

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

it('아바타가 신원 카드 트리거가 된다 (이름 + 프로필 라벨)', () => {
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
  expect(screen.getByRole('button', { name: '이멤버 프로필' })).toBeInTheDocument();
});
