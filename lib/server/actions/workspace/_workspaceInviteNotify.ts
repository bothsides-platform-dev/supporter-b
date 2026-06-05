/**
 * 워크스페이스 초대 인앱 알림 헬퍼.
 *
 * inviteWorkspaceMemberAction / resendWorkspaceInviteAction 가 공유한다. tx 안에서
 * 호출하고, 생성한 Notification 을 반환 → caller 가 commit 이후 emitAfterCommit 로 발화.
 *
 * 초대는 이메일 기준이라 받는 사람이 아직 그 워크스페이스 멤버가 아니다. 그래서 알림을
 * 특정 워크스페이스에 묶지 않고 **user-level(workspaceId=null)** 로 만든다 — 읽기 계층
 * (notification repo)이 어느 워크스페이스를 보든 노출한다.
 *
 * 이메일이 아직 가입 전이면 userId 가 없어 인앱 알림이 불가능 → null 반환(이메일만 전달).
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';

import { users } from '@/lib/db/schema';
import { dispatchNotification } from '@/lib/server/notifications/dispatch';
import type { Notification } from '@/lib/types/notification';
import type { Tx } from '@/lib/server/repositories/types';

export async function dispatchWorkspaceInviteInApp(
  tx: Tx,
  opts: { invitedEmail: string; workspaceName: string; linkUrl: string },
): Promise<Notification | null> {
  // invitedEmail 은 호출부에서 normalizeEmail 로 소문자화된 값.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user] = await (tx as any)
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${opts.invitedEmail}`)
    .limit(1);
  if (!user) return null;

  const notif: Notification = {
    id: randomUUID(),
    userId: user.id,
    workspaceId: null,
    type: 'workspace.invited',
    title: `${opts.workspaceName} 워크스페이스에 초대받았어요`,
    body: '초대를 수락하면 워크스페이스에 합류해요.',
    channel: 'inapp',
    status: 'pending',
    linkUrl: opts.linkUrl,
    createdAt: new Date().toISOString(),
  };
  await dispatchNotification(tx, notif);
  return notif;
}
