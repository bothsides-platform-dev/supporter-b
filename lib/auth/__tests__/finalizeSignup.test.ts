// finalizeSignup — invite-path EMAIL_TAKEN recovery (#8).
//
// 미인증 기존계정을 가진 초대 유저가 비인증 가입 동선을 끝까지 진행하면
// signupViaWorkspaceInviteAction 이 UNIQUE 위반으로 EMAIL_TAKEN 을 반환한다.
// 이때 막다른 길(정적 에러 메시지) 대신 로그인 후 같은 초대 링크로 복귀해
// 수락하도록 redirectTo 를 돌려줘야 한다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const draftRef: { value: Record<string, unknown> } = { value: {} };
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => draftRef.value,
  clearSignupDraft: vi.fn(),
}));

const inviteActionMock = vi.fn();
const completeActionMock = vi.fn();
vi.mock('@/lib/server/actions/auth', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signupViaWorkspaceInviteAction: (...a: any[]) => inviteActionMock(...a),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signupCompleteAction: (...a: any[]) => completeActionMock(...a),
}));

const signInMock = vi.fn();
vi.mock('next-auth/react', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signIn: (...a: any[]) => signInMock(...a),
}));

import { finalizeSignup } from '@/lib/auth/finalizeSignup';

const INVITE_DRAFT = {
  email: 'x@example.com',
  password: 'pw-123456',
  name: 'Invitee',
  phone: '01012345678',
  phoneVerificationId: 'vid-1',
  wsInviteToken: 'TOK123',
};

beforeEach(() => {
  inviteActionMock.mockReset();
  completeActionMock.mockReset();
  signInMock.mockReset();
  draftRef.value = {};
});

describe('finalizeSignup — invite EMAIL_TAKEN recovery (#8)', () => {
  it('returns a /login?next=<invite> redirect when the invite signup hits EMAIL_TAKEN', async () => {
    draftRef.value = { ...INVITE_DRAFT };
    inviteActionMock.mockResolvedValue({ ok: false, error: 'EMAIL_TAKEN' });

    const r = await finalizeSignup();

    expect(r).toEqual({
      ok: false,
      error: 'EMAIL_TAKEN',
      redirectTo: `/login?next=${encodeURIComponent('/invite/workspace/TOK123')}`,
    });
    // must NOT attempt auto-login on a failed signup
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('does not add a redirect for a non-invite EMAIL_TAKEN (normal signup)', async () => {
    draftRef.value = {
      email: 'x@example.com',
      password: 'pw-123456',
      name: 'Buyer',
      phone: '01012345678',
      phoneVerificationId: 'vid-1',
      workspaceType: 'pg',
      wsName: 'Co',
      bizNo: '1234567890',
    };
    completeActionMock.mockResolvedValue({ ok: false, error: 'EMAIL_TAKEN' });

    const r = await finalizeSignup();

    expect(r).toEqual({ ok: false, error: 'EMAIL_TAKEN' });
  });
});
