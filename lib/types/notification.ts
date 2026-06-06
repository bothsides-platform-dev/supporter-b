export type NotificationChannel = 'email' | 'inapp';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'read';

export type Notification = {
  id: string;
  userId: string;
  // null = user-level (워크스페이스에 묶이지 않은 알림 — 어느 ws를 보든 표시).
  workspaceId: string | null;
  type: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  linkUrl?: string;
  createdAt: string;
  sentAt?: string;
  readAt?: string;
};
