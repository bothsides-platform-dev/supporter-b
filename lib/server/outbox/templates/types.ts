// Props for the react-email templates. Most are wired to outbox events; the
// exception is AdminSignupReviewProps, whose template is rendered directly by
// the admin-signup notifier (sendAdminEmail), not through the outbox dispatcher.
// Each interface mirrors what the corresponding action passes when it builds
// the email body. Keep this file dependency-free so it can be imported from
// templates, actions, and tests without pulling React.

export interface AuthVerifyProps {
  verifyUrl: string;
  expiresMinutes: number;
}

export interface AuthResetProps {
  resetUrl: string;
  expiresMinutes: number;
}

export interface AuthEmailChangeProps {
  confirmUrl: string;
  newEmail: string;
  expiresHours: number;
}

export interface RfpInvitedProps {
  rfpId: string;
  rfpTitle: string;
  buyerName: string;
  deadline: string;
  inviteUrl: string;
}

export interface RfpSentProps {
  rfpId: string;
  rfpTitle: string;
  inviteCount: number;
}

export interface BidSubmittedProps {
  rfpId: string;
  rfpTitle: string;
  pgName: string;
  submittedAt: string;
}

export interface RfpAwardedProps {
  rfpId: string;
  rfpTitle: string;
  bidId: string;
  settlementCycle: string;
}

export interface WorkspaceInvitedProps {
  workspaceName: string;
  inviteUrl: string;
}

export interface AdminSignupReviewProps {
  workspaceName: string;
  orgLabel: string;
  reviewUrl: string;
}

export interface WorkspaceApprovedProps {
  workspaceName: string;
  orgLabel: string;
  loginUrl: string;
}
