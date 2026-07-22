// `classifyAccountDeletion` is the single source for "can this user delete
// their account?" — previously duplicated verbatim in `AuthService.deleteAccount`
// and the `getDeleteAccountStatus` action, which meant the two surfaces could
// drift into disagreeing about the same workspace.
//
// The solo/blocking DETERMINATION is deliberately unchanged (it is fail-closed:
// it never auto-deletes a workspace that still has anyone else in it). What is
// new is `hasDelegatableMember`, which exists so the UI stops giving impossible
// advice: telling someone to "delegate admin to another member" is useless when
// every remaining member is pending approval, rejected, or a system account the
// member list does not even render.

import { describe, expect, it } from 'vitest';

import { classifyAccountDeletion } from '@/lib/auth/account-deletion';
import type { DeletionMembership } from '@/lib/auth/account-deletion';

const ME = 'me-user-id';

function membership(overrides: Partial<DeletionMembership> = {}): DeletionMembership {
  return {
    workspaceId: 'ws-1',
    name: '구매사',
    role: 'admin',
    approvalStatus: 'approved',
    members: [],
    ...overrides,
  };
}

function member(overrides: Partial<DeletionMembership['members'][number]> = {}) {
  return {
    userId: 'other-user-id',
    role: 'member' as const,
    approvalStatus: 'approved' as const,
    isSystemAccount: false,
    ...overrides,
  };
}

describe('classifyAccountDeletion', () => {
  it('treats a workspace where the user is the only member as solo', () => {
    const result = classifyAccountDeletion(
      [membership({ members: [member({ userId: ME, role: 'admin' })] })],
      ME,
    );

    expect(result.soloWorkspaces).toEqual([{ id: 'ws-1', name: '구매사' }]);
    expect(result.blockingWorkspaces).toEqual([]);
  });

  it('does not block when another approved admin remains', () => {
    const result = classifyAccountDeletion(
      [
        membership({
          members: [
            member({ userId: ME, role: 'admin' }),
            member({ userId: 'other', role: 'admin' }),
          ],
        }),
      ],
      ME,
    );

    expect(result.blockingWorkspaces).toEqual([]);
    expect(result.soloWorkspaces).toEqual([]);
  });

  it('blocks with a delegatable member when an approved non-admin remains', () => {
    const result = classifyAccountDeletion(
      [
        membership({
          members: [
            member({ userId: ME, role: 'admin' }),
            member({ userId: 'teammate', role: 'member' }),
          ],
        }),
      ],
      ME,
    );

    // Real person, already approved → "hand admin over to them" is actionable.
    expect(result.blockingWorkspaces).toEqual([
      { id: 'ws-1', name: '구매사', hasDelegatableMember: true },
    ]);
  });

  it('blocks with NO delegatable member when the only other member is pending approval', () => {
    const result = classifyAccountDeletion(
      [
        membership({
          members: [
            member({ userId: ME, role: 'admin' }),
            member({ userId: 'joiner', role: 'admin', approvalStatus: 'pending_approval' }),
          ],
        }),
      ],
      ME,
    );

    // A pending member cannot hold effective admin, so telling the user to
    // delegate to them would send them in a circle.
    expect(result.blockingWorkspaces).toEqual([
      { id: 'ws-1', name: '구매사', hasDelegatableMember: false },
    ]);
  });

  it('blocks with NO delegatable member when the only other member is a rejected one', () => {
    const result = classifyAccountDeletion(
      [
        membership({
          members: [
            member({ userId: ME, role: 'admin' }),
            member({ userId: 'nope', approvalStatus: 'rejected' }),
          ],
        }),
      ],
      ME,
    );

    expect(result.blockingWorkspaces).toEqual([
      { id: 'ws-1', name: '구매사', hasDelegatableMember: false },
    ]);
  });

  it('blocks with NO delegatable member when the only other member is a hidden system account', () => {
    const result = classifyAccountDeletion(
      [
        membership({
          members: [
            member({ userId: ME, role: 'admin' }),
            member({ userId: 'sys', role: 'member', isSystemAccount: true }),
          ],
        }),
      ],
      ME,
    );

    // System accounts are filtered out of every member list in the UI, so the
    // user would be told to delegate to somebody they cannot see.
    expect(result.blockingWorkspaces).toEqual([
      { id: 'ws-1', name: '구매사', hasDelegatableMember: false },
    ]);
  });

  // Pins CURRENT behaviour, which this change deliberately leaves alone: an
  // approved-admin system account still counts as "another admin", so deletion
  // is allowed and the workspace is left with no human admin. Changing that is
  // a product decision, not a copy fix — tracked in TODOS.
  it('does not block when an approved-admin system account remains (current behaviour)', () => {
    const result = classifyAccountDeletion(
      [
        membership({
          members: [
            member({ userId: ME, role: 'admin' }),
            member({ userId: 'master', role: 'admin', isSystemAccount: true }),
          ],
        }),
      ],
      ME,
    );

    expect(result.blockingWorkspaces).toEqual([]);
  });

  // The loop must keep classifying after each verdict. If a `continue` ever
  // became a `return`, every single-workspace test above would still pass while
  // real users with several workspaces silently lost a blocker or a solo entry.
  it('classifies every workspace, not just the first', () => {
    const result = classifyAccountDeletion(
      [
        membership({
          workspaceId: 'ws-solo',
          name: '1인 회사',
          members: [member({ userId: ME, role: 'admin' })],
        }),
        membership({
          workspaceId: 'ws-safe',
          name: '동료 있는 회사',
          members: [
            member({ userId: ME, role: 'admin' }),
            member({ userId: 'co-admin', role: 'admin' }),
          ],
        }),
        membership({
          workspaceId: 'ws-blocked',
          name: '나만 관리자',
          members: [
            member({ userId: ME, role: 'admin' }),
            member({ userId: 'teammate', role: 'member' }),
          ],
        }),
        membership({
          workspaceId: 'ws-stuck',
          name: '넘길 사람 없음',
          members: [
            member({ userId: ME, role: 'admin' }),
            member({ userId: 'joiner', approvalStatus: 'pending_approval' }),
          ],
        }),
      ],
      ME,
    );

    expect(result.soloWorkspaces).toEqual([{ id: 'ws-solo', name: '1인 회사' }]);
    expect(result.blockingWorkspaces).toEqual([
      { id: 'ws-blocked', name: '나만 관리자', hasDelegatableMember: true },
      { id: 'ws-stuck', name: '넘길 사람 없음', hasDelegatableMember: false },
    ]);
  });

  it('ignores workspaces where the user is not an approved admin', () => {
    const result = classifyAccountDeletion(
      [
        membership({
          role: 'admin',
          approvalStatus: 'pending_approval',
          members: [
            member({ userId: ME, role: 'admin', approvalStatus: 'pending_approval' }),
            member({ userId: 'other', role: 'admin' }),
          ],
        }),
      ],
      ME,
    );

    expect(result.blockingWorkspaces).toEqual([]);
    expect(result.soloWorkspaces).toEqual([]);
  });
});
