import { getBusinessCalendarRepo, getDb, getDeadlineNotificationRepo, getRfpRepo, getRfpRequoteRequestRepo, getPgMatchingRepo, getInvitationRepo, getBidRepo, getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { planDeadlineNotices } from '@/lib/rfp/deadline-notice-plan';
import { kstDateOf } from '@/lib/utils/deadline';
import { notify } from '@/lib/server/notifications/notify';
import { emitAfterCommit } from '@/lib/server/notifications/dispatch';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { baseUrlFor } from '@/lib/server/env';
import { logger } from '@/lib/observability/logger';
import type { Notification } from '@/lib/types/notification';
import type { Tx } from '@/lib/server/repositories/types';

const DAY_MS = 86_400_000;
/**
 * 마감 안내는 방금 닫힌 접수에만 보낸다. 선정 없이 `sent` 로 남은 옛 견적은
 * 매 분 스캔에 계속 잡히므로, 이 창이 없으면 기능을 켜는 첫 분에 수개월 전
 * 마감까지 한꺼번에 "마감됐어요" 메일이 나간다.
 */
const CLOSED_NOTICE_WINDOW_MS = DAY_MS;

function dateBefore(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function dateLabel(deadline: string): string {
  const instant = new Date(deadline);
  const date = kstDateOf(instant);
  const [, month, day] = date.split('-');
  const hour = (instant.getUTCHours() + 9) % 24;
  const period = hour < 12 ? '오전' : '오후';
  const minute = instant.getUTCMinutes();
  return `${Number(month)}월 ${Number(day)}일 ${period} ${hour % 12 || 12}시${minute ? ` ${minute}분` : ''}`;
}

/** Scans with an ID cursor so old claims never starve later RFPs. Each RFP is re-read under its row lock. */
export async function runRfpDeadlineNotices(fixedNow?: Date): Promise<{ processed: number; notified: number; failed: number }> {
  if (process.env.BUSINESS_DEADLINES_ENABLED !== 'true') return { processed: 0, notified: 0, failed: 0 };
  const db = await getDb();
  const deliveries = await getDeadlineNotificationRepo();
  const rfpRepo = await getRfpRepo();
  const requotes = await getRfpRequoteRequestRepo();
  const matching = await getPgMatchingRepo();
  const invitations = await getInvitationRepo();
  const bids = await getBidRepo();
  const workspaces = await getWorkspaceRepo();
  const calendars = await getBusinessCalendarRepo();
  let processed = 0;
  let notified = 0;
  let failed = 0;
  let cursor: string | undefined;
  const events = await calendars.addedClosureEvents();
  for (;;) {
    const ids = await deliveries.sentRfpIds(cursor, 250);
    if (ids.length === 0) break;
    for (const id of ids) {
      cursor = id;
      const emits: Notification[] = [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const count: number = await db.transaction(async (tx: any) => {
          const rfp = await rfpRepo.findByIdForUpdate(id, tx);
          if (!rfp || rfp.status !== 'sent') return 0;
          const now = fixedNow ?? new Date();
          const pending = (await requotes.findByRfp(id, tx)).filter((req) => req.status === 'pending');
          const currentReview = (await matching.reviews(id, tx)).at(-1);
          const isMatching = !!(await matching.find(id, tx));
          const pgIds = isMatching
            ? currentReview && ['requested', 'reviewing', 'quoted'].includes(currentReview.status) ? [currentReview.pgWorkspaceId] : []
            : [...new Set((await invitations.findByRfp(id, tx))
              .filter((inv) => !['draft', 'declined', 'expired'].includes(inv.status))
              .map((inv) => inv.pgWsId))];
          const allBids = await bids.findByRfp(id, tx);
          const withdrawn = new Set(allBids.filter((bid) => bid.status === 'withdrawn').map((bid) => bid.pgWsId));
          const eligiblePgIds = pgIds.filter((pgId) => !withdrawn.has(pgId));
          const effectiveDeadline = new Date(Math.max(new Date(rfp.deadline).getTime(), ...pending.map((req) => new Date(req.deadline).getTime())));
          const date = kstDateOf(effectiveDeadline);
          const today = kstDateOf(now);
          const calendar = await calendars.read(dateBefore(today, 40), date, tx) ?? await calendars.read(today, date, tx);
          const plan = planDeadlineNotices({
            now, commonDeadline: rfp.deadline, calendar: calendar ?? { coveredThrough: '', holidays: new Set() },
            pgIds: calendar ? eligiblePgIds : [],
            pending: pending.map((req) => ({ id: req.id, pgWsId: req.pgWsId, round: req.round, deadline: req.deadline })),
            submitted: allBids.filter((bid) => bid.status === 'submitted').map((bid) => ({ pgWsId: bid.pgWsId, round: bid.round })),
          });
          const rfpCode = rfp.code;
          let count = 0;
          async function send(
            kind: 'reminder' | 'closed' | 'calendar', recipients: { userId: string; workspaceId: string; email: string }[],
            keyFor: (userId: string) => string, deadline: Date, pgWsId: string | null, round: number | null,
            title: string, body: string, link: string, event: 'rfp.deadline_reminder' | 'rfp.bidding_closed' | 'rfp.calendar_changed',
          ): Promise<void> {
            const claimed = [];
            for (const recipient of recipients) {
              if (await deliveries.claim({ key: keyFor(recipient.userId), rfpId: id, recipientUserId: recipient.userId,
                kind, deadline, pgWsId, reviewId: currentReview?.id ?? null, round }, tx as Tx)) claimed.push(recipient);
            }
            if (claimed.length === 0) return;
            emits.push(...await notify(tx, {
              recipients: claimed, channels: ['inapp', 'email'], type: event,
              title, body, linkUrl: link,
              email: { event, subject: `[서포트비 · ${rfpCode}] ${title}`,
                html: `<p>${escapeHtml(body)}</p><p><a href="${baseUrlFor(pgWsId ? 'pg' : 'buyer')}${link}">딜룸에서 확인하기</a></p>`,
                dedupeKey: (member) => `${keyFor(member.userId)}:email` },
            }));
            count += claimed.length;
          }
          for (const reminder of plan.reminders) {
            const members = await workspaces.approvedMemberRecipients(reminder.pgWsId, tx);
            await send('reminder', members.map((member) => ({ ...member, workspaceId: reminder.pgWsId })),
              (userId) => `reminder:${id}:${reminder.pgWsId}:${currentReview?.id ?? 'legacy'}:${reminder.round}:${reminder.deadline}:${userId}`,
              new Date(reminder.deadline), reminder.pgWsId, reminder.round, '견적 마감일이 다가와요',
              `${rfp.code} 견적 제출 마감은 ${dateLabel(reminder.deadline)}예요.`, `/inbox/${rfp.code}`, 'rfp.deadline_reminder');
          }
          const buyerMembers = await workspaces.approvedMemberRecipients(rfp.buyerWsId, tx);
          const justClosed = plan.closed && now.getTime() - effectiveDeadline.getTime() < CLOSED_NOTICE_WINDOW_MS;
          if (justClosed && (!isMatching || (currentReview && ['requested', 'reviewing', 'quoted'].includes(currentReview.status)))) {
            const noCurrentQuote = isMatching && currentReview && !allBids.some((bid) =>
              bid.pgWsId === currentReview.pgWorkspaceId && bid.status === 'submitted');
            const closedBody = noCurrentQuote
              ? `${rfp.code}의 견적 접수가 끝났어요. 다음 PG사에 상담을 요청하거나 접수를 다시 열 수 있어요.`
              : `${rfp.code}의 견적 접수가 끝났어요. 받은 견적을 확인하거나 접수를 다시 열 수 있어요.`;
            await send('closed', buyerMembers.map((member) => ({ ...member, workspaceId: rfp.buyerWsId })),
              (userId) => `closed:${id}:${rfp.deadline}:${pending.map((req) => req.deadline).sort().join(',')}:${userId}`,
              new Date(rfp.deadline), null, null, '견적 접수가 마감됐어요',
              closedBody,
              `/rfp/${rfp.code}`, 'rfp.bidding_closed');
          }
          if (effectiveDeadline.getTime() > now.getTime()) {
            const requestedDate = kstDateOf(new Date(rfp.sentAt ?? rfp.createdAt));
            for (const event of events) {
              if (event.createdAt.getTime() <= Date.parse(rfp.sentAt ?? rfp.createdAt) ||
                  event.date <= requestedDate || event.date > date) continue;
              await send('calendar', buyerMembers.map((member) => ({ ...member, workspaceId: rfp.buyerWsId })),
                (userId) => `calendar:${event.id}:${id}:${userId}`, new Date(rfp.deadline), null, null,
                '휴일이 추가됐어요', `${event.date} ${event.name} 휴일이 추가됐어요. 견적 기간을 확인하고 필요하면 마감일을 연장해 주세요.`,
                `/rfp/${rfp.code}`, 'rfp.calendar_changed');
            }
          }
          return count;
        });
        emitAfterCommit(emits);
        if (count) flushAfterCommit();
        notified += count;
      } catch (error) {
        failed++;
        logger.error('cron.rfp_deadline_failed', { rfpId: id, err: String(error) });
      }
      processed++;
    }
    if (ids.length < 250) break;
  }
  return { processed, notified, failed };
}
