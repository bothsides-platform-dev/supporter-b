// Workspace invite landing RSC — unauth branch wiring (#9 login redirect, #10 type).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
const mockAuth = vi.hoisted(() => vi.fn());
const mockAccountExists = vi.hoisted(() => vi.fn());
const rowRef = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/server/token', () => ({ hashToken: (t: string) => `hash:${t}` }));
vi.mock('@/lib/server/invite/workspaceInviteLanding', () => ({
  accountExistsForEmail: (...a: unknown[]) => mockAccountExists(...a),
}));

// The page resolves the invitation via getWorkspaceRepo().findInvitationByTokenHash;
// stub it to return rowRef.value (or undefined when absent). prodDb is still
// imported (for accountExistsForEmail, which is mocked) so keep a no-op db stub.
vi.mock('@/lib/db/client', () => ({ db: {} }));
const mockFindInvitationByTokenHash = vi.hoisted(() =>
  vi.fn(() => Promise.resolve(rowRef.value ?? undefined)),
);
vi.mock('@/lib/server/repositories/factory', () => ({
  getWorkspaceRepo: () =>
    Promise.resolve({ findInvitationByTokenHash: mockFindInvitationByTokenHash }),
}));

// Identify which client component the page renders.
vi.mock('../WorkspaceInviteAuthedClient', () => ({
  WorkspaceInviteAuthedClient: () => null,
}));
vi.mock('../WorkspaceInviteEmailMismatch', () => ({
  WorkspaceInviteEmailMismatch: () => null,
}));
vi.mock('../WorkspaceInviteUnauthClient', () => ({
  WorkspaceInviteUnauthClient: () => null,
}));

import WorkspaceInvitePage from '../page';

const params = (token: string) => Promise.resolve({ token });

const validRow = {
  invitedEmail: 'invited@example.com',
  status: 'pending',
  expiresAt: new Date(Date.now() + 60_000),
  workspaceName: 'Some Co',
  workspaceId: 'ws-1',
};

beforeEach(() => {
  mockRedirect.mockClear();
  mockAuth.mockReset();
  mockAccountExists.mockReset();
  rowRef.value = { ...validRow };
});

describe('WorkspaceInvitePage — unauthenticated branch', () => {
  it('redirects an invitee who already has an account to /login?next=<invite> (#9)', async () => {
    mockAuth.mockResolvedValue(null);
    mockAccountExists.mockResolvedValue(true);

    await expect(WorkspaceInvitePage({ params: params('TOK') })).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(mockRedirect).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent('/invite/workspace/TOK')}`,
    );
  });

  it('renders the signup hand-off when no account exists yet', async () => {
    mockAuth.mockResolvedValue(null);
    mockAccountExists.mockResolvedValue(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await WorkspaceInvitePage({ params: params('TOK') })) as any;

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result.props).toMatchObject({
      token: 'TOK',
      inviteEmail: 'invited@example.com',
    });
  });
});
