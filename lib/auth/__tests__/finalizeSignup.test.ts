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

const joinCanonicalMock = vi.fn();
vi.mock('@/lib/server/actions/auth/joinCanonicalPgWorkspaceAction', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  joinCanonicalPgWorkspaceAction: (...a: any[]) => joinCanonicalMock(...a),
}));

// 가입 직후 자동 로그인은 loginAction(서버사이드 signIn + 레이트리밋)을 재사용한다
// (크로스호스트 CSRF/HTTP 왕복 회피 — partner.supporter-b.com 가입에서 클라 signIn 이
// 막히던 버그). 클라 next-auth/react signIn 은 더 이상 쓰지 않는다.
const loginActionMock = vi.fn();
vi.mock('@/lib/server/actions/auth/loginAction', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loginAction: (...a: any[]) => loginActionMock(...a),
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

const BUYER_DRAFT_BASE = {
  email: 'buyer@example.com',
  password: 'pw-123456',
  name: 'Buyer',
  phone: '01012345678',
  phoneVerificationId: 'vid-2',
  workspaceType: 'buyer',
  wsName: '구매사',
  bizProfile: { bizNo: '1234567890', taxType: 'general', status: 'active' },
};

beforeEach(() => {
  inviteActionMock.mockReset();
  completeActionMock.mockReset();
  joinCanonicalMock.mockReset();
  loginActionMock.mockReset();
  // 자동 로그인 기본값: 성공.
  loginActionMock.mockResolvedValue({ ok: true });
  draftRef.value = {};
});

const CANONICAL_PG_DRAFT = {
  email: 'sales@toss.im',
  password: 'pw-123456',
  name: '영업담당자',
  phone: '01012345678',
  phoneVerificationId: 'vid-pg',
  selectedPgWorkspaceId: 'ws-toss-uuid',
};

describe('finalizeSignup — canonical PG workspace 합류 경로', () => {
  it('selectedPgWorkspaceId 있으면 joinCanonicalPgWorkspaceAction을 호출하고 /inbox로 리디렉션', async () => {
    draftRef.value = { ...CANONICAL_PG_DRAFT };
    joinCanonicalMock.mockResolvedValue({
      ok: true,
      redirectTo: '/inbox',
      email: 'sales@toss.im',
      password: 'pw-123456',
    });

    const r = await finalizeSignup();

    expect(joinCanonicalMock).toHaveBeenCalledWith(
      expect.objectContaining({ selectedPgWorkspaceId: 'ws-toss-uuid' }),
    );
    expect(inviteActionMock).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, redirectTo: '/inbox' });
  });

  it('joinCanonicalPgWorkspaceAction 에러 시 ok:false 전파', async () => {
    draftRef.value = { ...CANONICAL_PG_DRAFT };
    joinCanonicalMock.mockResolvedValue({ ok: false, error: 'INVALID_CANONICAL_WORKSPACE' });

    const r = await finalizeSignup();

    expect(r).toEqual({ ok: false, error: 'INVALID_CANONICAL_WORKSPACE' });
    expect(loginActionMock).not.toHaveBeenCalled();
  });

  it('selectedPgWorkspaceId가 wsInviteToken보다 우선한다', async () => {
    draftRef.value = { ...CANONICAL_PG_DRAFT, wsInviteToken: 'INVITE-TOKEN' };
    joinCanonicalMock.mockResolvedValue({
      ok: true,
      redirectTo: '/inbox',
      email: 'sales@toss.im',
      password: 'pw-123456',
    });

    await finalizeSignup();

    expect(joinCanonicalMock).toHaveBeenCalled();
    expect(inviteActionMock).not.toHaveBeenCalled();
  });
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
    expect(loginActionMock).not.toHaveBeenCalled();
  });

  it('does not add a redirect for non-invite EMAIL_TAKEN (normal signup)', async () => {
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

describe('finalizeSignup — 서버사이드 자동 로그인', () => {
  it('가입 성공 시 loginAction을 액션이 돌려준 email/password로 호출한다', async () => {
    draftRef.value = { ...CANONICAL_PG_DRAFT };
    joinCanonicalMock.mockResolvedValue({
      ok: true,
      redirectTo: '/inbox',
      email: 'sales@toss.im',
      password: 'pw-123456',
    });

    await finalizeSignup();

    expect(loginActionMock).toHaveBeenCalledWith({
      email: 'sales@toss.im',
      password: 'pw-123456',
    });
  });

  it('초대 가입 성공 시 loginAction 호출 후 액션 redirectTo 반환', async () => {
    draftRef.value = { ...INVITE_DRAFT };
    inviteActionMock.mockResolvedValue({
      ok: true,
      redirectTo: '/inbox',
      email: 'x@example.com',
      password: 'pw-123456',
    });

    const r = await finalizeSignup();

    expect(loginActionMock).toHaveBeenCalledWith({
      email: 'x@example.com',
      password: 'pw-123456',
    });
    expect(r).toEqual({ ok: true, redirectTo: '/inbox' });
  });

  it('loginAction이 ok:false면 SIGNIN_FAILED 반환', async () => {
    draftRef.value = { ...BUYER_DRAFT_BASE };
    completeActionMock.mockResolvedValue({
      ok: true,
      redirectTo: '/rfp',
      email: 'buyer@example.com',
      password: 'pw-123456',
    });
    loginActionMock.mockResolvedValue({ ok: false, error: 'SIGNIN_FAILED' });

    const r = await finalizeSignup();

    expect(r).toEqual({ ok: false, error: 'SIGNIN_FAILED' });
  });
});

describe('finalizeSignup — next 복귀 URL 오버라이드', () => {
  it('buyer draft에 next=/rfp/new가 있으면 redirectTo가 /rfp/new로 오버라이드됨', async () => {
    draftRef.value = { ...BUYER_DRAFT_BASE, next: '/rfp/new' };
    completeActionMock.mockResolvedValue({ ok: true, redirectTo: '/rfp', email: 'buyer@example.com', password: 'pw-123456' });

    const r = await finalizeSignup();

    expect(r).toEqual({ ok: true, redirectTo: '/rfp/new' });
  });

  it('불안전한 next(//evil.com)는 무시하고 서버 기본값 사용', async () => {
    draftRef.value = { ...BUYER_DRAFT_BASE, next: '//evil.com' };
    completeActionMock.mockResolvedValue({ ok: true, redirectTo: '/rfp', email: 'buyer@example.com', password: 'pw-123456' });

    const r = await finalizeSignup();

    expect(r).toEqual({ ok: true, redirectTo: '/rfp' });
  });

  it('next 없으면 서버 기본값(/rfp) 그대로 사용', async () => {
    draftRef.value = { ...BUYER_DRAFT_BASE };
    completeActionMock.mockResolvedValue({ ok: true, redirectTo: '/rfp', email: 'buyer@example.com', password: 'pw-123456' });

    const r = await finalizeSignup();

    expect(r).toEqual({ ok: true, redirectTo: '/rfp' });
  });
});
