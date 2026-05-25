import type { BizProfile } from './biz-profile';
import type { User } from './user';

export type WorkspaceType = 'buyer' | 'pg';

export type Workspace = {
  id: string;
  type: WorkspaceType;
  name: string;
  bizProfile?: BizProfile;
  members: User[];
  shareToken: string;
  createdAt: string;
};

// Lean per-membership summary for the workspace switcher — one row per
// workspace a user belongs to, with that user's role in it.
export type WorkspaceMembershipSummary = {
  id: string;
  name: string;
  type: WorkspaceType;
  role: 'admin' | 'member';
  unreadCount: number;
};
