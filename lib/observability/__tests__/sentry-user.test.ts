import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setUser, setTag } = vi.hoisted(() => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ setUser, setTag }));

import { setSentryUser } from '../sentry-user';

beforeEach(() => {
  setUser.mockReset();
  setTag.mockReset();
});

describe('setSentryUser', () => {
  it('forwards only the id to Sentry.setUser (drops email/name)', () => {
    setSentryUser({
      id: 'u1',
      email: 'kim@toss.im',
      name: 'Kim',
      workspaceId: 'w1',
      workspaceType: 'buyer',
      role: 'admin',
    });

    expect(setUser).toHaveBeenCalledWith({ id: 'u1' });
  });

  it('sets workspace and role tags', () => {
    setSentryUser({ id: 'u1', workspaceId: 'w9', workspaceType: 'pg', role: 'member' });

    expect(setTag).toHaveBeenCalledWith('workspace_id', 'w9');
    expect(setTag).toHaveBeenCalledWith('workspace_type', 'pg');
    expect(setTag).toHaveBeenCalledWith('role', 'member');
  });

  it('clears the user and sets no tags when given null', () => {
    setSentryUser(null);

    expect(setUser).toHaveBeenCalledWith(null);
    expect(setTag).not.toHaveBeenCalled();
  });
});
