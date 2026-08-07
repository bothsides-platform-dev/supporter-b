/**
 * Notification dispatch wrapper.
 *
 * 액션 코드가 `notificationRepo.save(...)`를 직접 호출하지 않도록 한 군데로
 * 모은다. 두 단계 분리:
 *   1) `dispatchNotification(tx, n)` — tx 안에서 row insert 수행.
 *      emit는 안 함 — tx가 rollback 되면 row도 살아남지 않는데 SSE만 떠나면
 *      클라이언트가 환영 row 보러 갔다가 404 나는 이슈가 생긴다.
 *   2) `emitAfterCommit(notifications)` — 액션 caller가 tx가 commit으로
 *      끝난 뒤에만 호출. 보통 패턴:
 *        const pendingEmits: Notification[] = [];
 *        const r = await db.transaction(async (tx) => {
 *          await dispatchNotification(tx, n);
 *          pendingEmits.push(n);
 *          ...
 *        });
 *        if (r.ok) emitAfterCommit(pendingEmits);
 *
 * Drizzle pglite/postgres-js에 commit hook이 없어 (드라이버 한계) caller가
 * 이 분리를 책임진다. tx throw 시 emit 미발생 — rollback과 SSE가 정합.
 */
import { getNotificationRepo } from '@/lib/server/repositories/factory';
import type { Notification } from '@/lib/types/notification';
import type { Tx } from '@/lib/server/repositories/types';
import { emit } from './bus';

/**
 * tx 내부에서 호출. notification row를 insert 한다.
 * SSE emit는 하지 않는다 — 호출자가 commit 이후 `emitAfterCommit`로 발화.
 */
export async function dispatchNotification(
  tx: Tx,
  notification: Notification,
): Promise<void> {
  const repo = await getNotificationRepo();
  await repo.save(notification, tx);
}

/**
 * 다수 수신자 팬아웃용 배치판 — row 를 한 문장으로 insert 한다. 알림 하나가
 * 워크스페이스 승인 멤버 전원에게 나갈 때 수신자마다 INSERT 를 돌면 트랜잭션이
 * 수신자 수만큼 길어진다.
 *
 * emit 규약은 `dispatchNotification` 과 동일 — 여기서는 발화하지 않고 호출자가
 * commit 이후 `emitAfterCommit` 를 부른다.
 */
export async function dispatchNotifications(
  tx: Tx,
  notifications: Notification[],
): Promise<void> {
  if (notifications.length === 0) return;
  const repo = await getNotificationRepo();
  await repo.saveMany(notifications, tx);
}

/**
 * tx 종료(commit) 이후 caller가 호출. inapp channel만 SSE emit 한다 —
 * email channel notification(별도 테이블 분리되지 않은 v0)은 outbox에서
 * 별도로 관리되며 SSE는 사용자 화면 쪽 채널이므로 inapp만 의미가 있다.
 */
export function emitAfterCommit(notifications: Notification[]): void {
  for (const n of notifications) {
    if (n.channel !== 'inapp') continue;
    emit(n.userId, n);
  }
}
