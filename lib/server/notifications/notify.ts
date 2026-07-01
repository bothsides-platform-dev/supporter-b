/**
 * 통합 알림 팬아웃. 수신자마다 channels 에 따라 in-app row insert(dispatchNotification)
 * 와 email outbox enqueue 를 tx 안에서 수행하고, 생성한 in-app Notification[] 을
 * 반환한다. 호출자는 반환값을 pendingEmits 에 모아 commit 후 emitAfterCommit 한다.
 *
 * 채널은 호출 단위로 모든 recipient 에 적용된다. 수신자별 채널 차이나 채널별
 * 수신자 집합 차이는 notify() 를 여러 번 호출해 표현한다.
 */
import { randomUUID } from 'node:crypto';
import { getOutboxRepo } from '@/lib/server/repositories/factory';
import { dispatchNotification } from './dispatch';
import type { Notification } from '@/lib/types/notification';
import type { Tx } from '@/lib/server/repositories/types';
import type { OutboxEvent } from '@/lib/server/outbox/types';

export type NotifyChannel = 'inapp' | 'email';

export type NotifyRecipient = {
  userId: string;
  workspaceId: string | null;
  email: string;
};

export type NotifyEmail = {
  event: OutboxEvent;
  subject: string;
  html: string;
  /**
   * 수신자 email 로부터 파생. 생략 시 dedupeKey 없음.
   * ⚠️ 키가 email 이 아닌 값(예: userId)에 기반해 호출-불변(`() => ...`)이면
   * 반드시 recipients 를 **단일 항목**으로 호출해야 한다 — 다중 recipient 에서
   * 동일 키를 내면 outbox 의 dedupe UNIQUE 인덱스에 걸려 1건만 저장되고
   * 나머지 이메일이 조용히 유실된다.
   */
  dedupeKey?: (email: string) => string;
  /** digest 코얼레싱용 미래 시각. 생략 시 즉시 발송. */
  scheduledAt?: Date;
};

export type NotifyInput = {
  recipients: NotifyRecipient[];
  channels: NotifyChannel[];
  type: string;
  title: string;
  body: string;
  linkUrl?: string;
  email?: NotifyEmail;
};

export async function notify(tx: Tx, input: NotifyInput): Promise<Notification[]> {
  const wantInapp = input.channels.includes('inapp');
  const wantEmail = input.channels.includes('email');
  if (wantEmail && !input.email) {
    throw new Error('notify: channels includes "email" but no email payload was provided');
  }

  const created: Notification[] = [];
  const outbox = wantEmail ? await getOutboxRepo() : null;

  for (const r of input.recipients) {
    if (wantInapp) {
      const n: Notification = {
        id: randomUUID(),
        userId: r.userId,
        workspaceId: r.workspaceId,
        type: input.type,
        title: input.title,
        body: input.body,
        channel: 'inapp',
        status: 'pending',
        ...(input.linkUrl ? { linkUrl: input.linkUrl } : {}),
        createdAt: new Date().toISOString(),
      };
      await dispatchNotification(tx, n);
      created.push(n);
    }
    if (wantEmail && input.email && outbox) {
      await outbox.enqueue(
        {
          event: input.email.event,
          to: r.email,
          subject: input.email.subject,
          html: input.email.html,
          ...(input.email.dedupeKey ? { dedupeKey: input.email.dedupeKey(r.email) } : {}),
          ...(input.email.scheduledAt ? { scheduledAt: input.email.scheduledAt } : {}),
        },
        tx,
      );
    }
  }

  return created;
}
