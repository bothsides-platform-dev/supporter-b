import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ captureException }));

import { captureActionError } from '../capture';

beforeEach(() => {
  captureException.mockReset();
});

describe('captureActionError', () => {
  it('captures with the action tag and no user when no session is given', () => {
    const err = new Error('boom');

    captureActionError('loginAction', err);

    expect(captureException).toHaveBeenCalledWith(err, {
      tags: { action: 'loginAction' },
    });
  });

  it('adds the user id and workspace tags when a session user is given', () => {
    const err = new Error('boom');

    captureActionError('createRfpAction', err, {
      id: 'u1',
      workspaceId: 'w9',
      workspaceType: 'pg',
      role: 'member',
    });

    expect(captureException).toHaveBeenCalledWith(err, {
      tags: { action: 'createRfpAction', workspace_id: 'w9', workspace_type: 'pg', role: 'member' },
      user: { id: 'u1' },
    });
  });

  it('forwards extra context', () => {
    const err = new Error('boom');

    captureActionError('lookupBizNoAction', err, null, { bizNoLen: 10 });

    expect(captureException).toHaveBeenCalledWith(err, {
      tags: { action: 'lookupBizNoAction' },
      extra: { bizNoLen: 10 },
    });
  });

  it('never throws even if Sentry.captureException throws', () => {
    captureException.mockImplementation(() => {
      throw new Error('sentry down');
    });

    expect(() => captureActionError('x', new Error('y'))).not.toThrow();
  });
});
