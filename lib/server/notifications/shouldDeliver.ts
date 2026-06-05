import type { Notification } from '@/lib/types/notification';

/**
 * SSE 스트림 전달 필터. 현재 워크스페이스 알림 + user-level(workspaceId=null)
 * 알림만 전달하고, 다른 워크스페이스 전용 알림은 누설하지 않는다.
 */
export function shouldDeliverToWorkspace(
  n: Notification,
  currentWorkspaceId: string,
): boolean {
  return n.workspaceId === null || n.workspaceId === currentWorkspaceId;
}
