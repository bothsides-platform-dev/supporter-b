// WorkspaceInviteUnauthClient — single neutral invite signup flow (#10/접근법 B).
//
// 초대 가입 화면은 타입 무관이라(워크스페이스 안 만듬) 모든 초대자를 하나의
// invite-aware 흐름(/signup/pg)으로 보낸다. buyer/pg 구분 없이 동일 경로.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

const writeSignupDraft = vi.fn();
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => ({}),
  writeSignupDraft: (...a: unknown[]) => writeSignupDraft(...a),
}));

import { WorkspaceInviteUnauthClient } from '../WorkspaceInviteUnauthClient';

beforeEach(() => {
  replace.mockReset();
  writeSignupDraft.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('WorkspaceInviteUnauthClient — single neutral invite flow', () => {
  it('routes any invitee to the one invite-aware flow (/signup/pg) and records the token + email', async () => {
    render(
      <WorkspaceInviteUnauthClient
        token="TOK"
        inviteEmail="x@example.com"
        workspaceName="Some Co"
      />,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/signup/pg'));
    expect(writeSignupDraft).toHaveBeenCalledWith(
      expect.objectContaining({ wsInviteToken: 'TOK', email: 'x@example.com' }),
    );
  });
});
