import type { BizProfile } from './biz-profile';
import type { User } from './user';

export type WorkspaceType = 'buyer' | 'pg';

export type Workspace = {
  id: string;
  type: WorkspaceType;
  name: string;
  bizProfile?: BizProfile;
  members: User[];
  hasLogo: boolean;
  createdAt: string;
};

export type MemberApprovalStatus = 'approved' | 'pending_approval' | 'rejected';

// Lean per-membership summary for the workspace switcher — one row per
// workspace a user belongs to, with that user's role in it.
export type WorkspaceMembershipSummary = {
  id: string;
  name: string;
  type: WorkspaceType;
  status: 'pending' | 'active' | 'suspended';
  role: 'admin' | 'member';
  memberApprovalStatus: MemberApprovalStatus;
  unreadCount: number;
  hasLogo: boolean;
};
