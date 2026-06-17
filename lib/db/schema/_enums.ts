import { pgEnum } from 'drizzle-orm/pg-core';

export const workspaceTypeEnum = pgEnum('workspace_type', ['buyer', 'pg']);
export const memberRoleEnum = pgEnum('member_role', ['admin', 'member']);

export const merchantGradeEnum = pgEnum('merchant_grade', [
  'small',
  'sme1',
  'sme2',
  'sme3',
  'general',
]);
export const gradeSourceEnum = pgEnum('grade_source', [
  'user_confirmed',
  'user_overridden',
  'unset',
  'admin_confirmed',
]);
export const taxTypeEnum = pgEnum('tax_type', ['general', 'simple', 'exempt']);
export const bizStatusEnum = pgEnum('biz_status', ['active', 'suspended', 'closed']);

export const rfpStatusEnum = pgEnum('rfp_status', [
  'draft',
  'sent',
  'closed',
  'cancelled',
  'awarded',
]);
export const invitationStatusEnum = pgEnum('invitation_status', [
  'draft',
  'pending',
  'opened',
  'accepted',
  'expired',
]);
export const bidStatusEnum = pgEnum('bid_status', ['draft', 'submitted', 'withdrawn']);

// 비초대 PG가 오픈 게시판에서 보낸 참여 요청(콜드 피치)의 상태.
export const pgRequestStatusEnum = pgEnum('pg_request_status', [
  'pending',
  'accepted',
  'rejected',
]);

export const notificationStatusEnum = pgEnum('notification_status', [
  'queued',
  'sent',
  'failed',
  'read',
]);
export const notificationChannelEnum = pgEnum('notification_channel', [
  'email',
  'in_app',
]);

export const outboxStatusEnum = pgEnum('outbox_status', [
  'pending',
  'sent',
  'failed',
]);
export const outboxEventEnum = pgEnum('outbox_event', [
  'auth.verify',
  'auth.reset',
  'auth.email-change',
  'rfp.invited',
  'rfp.sent',
  'bid.submitted',
  'rfp.awarded',
  'rfp.requote_requested',
  'workspace.invited',
  'workspace.approved',
  'workspace.rejected',
  'chat.message',
  'team_chat.message',
]);

export const workspaceInvitationStatusEnum = pgEnum('workspace_invitation_status', [
  'pending',
  'accepted',
  'expired',
]);

export const verificationPurposeEnum = pgEnum('verification_purpose', [
  'signup_email',
  'password_reset',
  'email_change',
]);

// Unified kanban: which board a column belongs to. (workspace_id, kind) is the
// board key — no `boards` table.
export const columnKindEnum = pgEnum('column_kind', ['pipeline']);

// Column accent color — mirrors the MD3 Chip color roles.
export const chipColorEnum = pgEnum('chip_color', [
  'primary',
  'tertiary',
  'warning',
  'error',
  'surface',
]);

export const workspaceStatusEnum = pgEnum('workspace_status', [
  'pending',
  'active',
  'suspended',
]);

export const verificationStatusEnum = pgEnum('verification_status', [
  'submitted',
  'review_pending',
  'needs_more_info',
  'approved',
  'rejected',
]);

export const contractTypeEnum = pgEnum('contract_type', ['new', 'renewal']);

export const rfpRequoteRequestStatusEnum = pgEnum('rfp_requote_request_status', [
  'pending',
  'responded',
]);
