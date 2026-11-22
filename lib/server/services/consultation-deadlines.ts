import { getConsultationRepo, getDb } from '../repositories/factory';
import { askBuyer, lockConsultation, notifyAvailableSwitch } from './consultation-contact';
import { caseNotice, liveConsultation, operationNotice } from './consultation-notices';
import { deliverAssignment } from './consultation-assignment';
import { emitAfterCommit } from '../notifications/dispatch';
import { flushAfterCommit } from '../outbox/post-commit';
import type { Tx } from '../repositories/types';
import type { Notification } from '@/lib/types/notification';
import { logger } from '@/lib/observability/logger';

export async function runConsultationDeadlines(now = new Date()) {
  const repo = await getConsultationRepo();
  const db = await getDb();
  let after: string | undefined;
  let notified = 0,
    failed = 0;
  for (;;) {
    const rows = await repo.pendingCases(after);
    if (!rows.length) break;
    for (const row of rows) {
      after = row.id;
      try {
        const pending = await db.transaction(async (tx: Tx) => {
          const c = await lockConsultation(row.id, tx);
          const emits: Notification[] = [];
          if (!c) return emits;
          const live = liveConsultation(c);
          if (live && c.assignment.notifiedRevision < c.assignment.revision)
            emits.push(...(await deliverAssignment(c, tx)));
          const state = await repo.progress(row.id, tx);
          const q = await repo.latest(row.id, tx);
          if (
            q &&
            live &&
            q.revision === c.assignment.revision &&
            !q.answer &&
            q.remindAt <= now &&
            q.expiresAt > now &&
            (await repo.event(row.id, 'remind-' + q.id, '', tx))
          )
            emits.push(...(await askBuyer(c, q, tx, true)));
          for (const kind of ['contact', 'quote'] as const) {
            const late = kind === 'contact' ? state?.contactLate || state?.canSwitch : state?.quoteLate;
            if (!late || !(await repo.event(row.id, 'late-' + kind, '', tx))) continue;
            const title =
              kind === 'contact' ? '첫 연락 기한이 지났어요' : '견적 마감까지 제출되지 않았어요';
            await operationNotice(
              tx,
              c,
              'late-' + kind,
              title,
              c.rfp.code + ' 상담 기록을 확인해주세요.',
            );
            if (!live) continue;
            const members = await repo.recipients(c.review.pgWorkspaceId, 'pg', tx);
            const rep = members.filter((m) => m.userId === c.assignment.assignee);
            const managers = members.filter(
              (m) => m.role === 'admin' && m.userId !== c.assignment.assignee,
            );
            const action = c.rfp.code + ' 상담 진행 상황을 확인하고 조치해주세요.';
            emits.push(
              ...(await caseNotice(tx, c, 'rep', rep, 'late-' + kind, title, action)),
              ...(await caseNotice(tx, c, 'pg-admin', managers, 'late-' + kind, title, action)),
            );
            if (kind === 'contact' && state.canSwitch) {
              emits.push(...(await notifyAvailableSwitch(c, q?.id, tx)));
            } else {
              const buyers = await repo.recipients(c.rfp.buyer, 'buyer', tx);
              const body =
                kind === 'quote'
                  ? '마감을 연장하거나 다음 PG사를 선택할 수 있어요.'
                  : '상담 진행 기록을 확인해주세요.';
              emits.push(...(await caseNotice(tx, c, 'buyer', buyers, 'late-' + kind, title, body)));
            }
          }
          return emits;
        });
        emitAfterCommit(pending);
        if (pending.length) flushAfterCommit();
        notified += pending.length;
      } catch (error) {
        failed++;
        logger.error('consultation.deadline_failed', { reviewId: row.id, err: String(error) });
      }
    }
    if (rows.length < 100) break;
  }
  return { notified, failed };
}
