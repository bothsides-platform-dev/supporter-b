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

/**
 * 안 읽음 = 사용자가 아직 확인하지 않은 것. 사이드바 배지·페이지 헤더 칩·
 * 목록이 **이 술어 하나**를 공유한다 — 예전에는 판정식이 셋으로 갈려
 * (`status !== 'read'` / `pending|sent` / `read_at IS NULL`) 헤더 숫자와
 * 사이드바 배지가 서로 다른 것을 셀 수 있었다.
 *
 * `failed` 는 제외한다. 전달 실패는 미읽음이 아니라 실패이며, 목록 행의 상태
 * 칩이 이미 `실패` 로 따로 라벨링한다 — 여기서 미읽음으로 세면 헤더 숫자가
 * 바로 아래 칩들과 어긋난다.
 */
export function isUnread(n: Pick<Notification, 'status'>): boolean {
  return n.status === 'pending' || n.status === 'sent';
}
