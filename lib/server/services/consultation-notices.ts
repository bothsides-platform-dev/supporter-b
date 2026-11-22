import { z } from 'zod';
import { VOLUME_LABELS } from '@/lib/rfp/assignment';
import { migrateCurrentTerms } from '@/lib/types/rfp-terms';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getConsultationRepo } from '@/lib/server/repositories/factory';
import { notify, type NotifyRecipient } from '@/lib/server/notifications/notify';
import { baseUrlFor } from '@/lib/server/env';
import type { Tx } from '@/lib/server/repositories/types';
import type { ConsultationCase, ContactQuestion } from '@/lib/server/repositories/drizzle/consultation';
import type { OutboxEntry } from '@/lib/server/outbox/types';
import type { Notification } from '@/lib/types/notification';

export function questionToken(q: ContactQuestion) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET_REQUIRED');
  return createHmac('sha256', secret)
    .update(
      JSON.stringify([
        'pg-contact-v1',
        q.id,
        q.reviewId,
        q.recipient,
        q.revision,
        q.expiresAt.toISOString(),
      ]),
    )
    .digest('base64url');
}
export function validQuestionToken(q: ContactQuestion, token: string) {
  const expected = Buffer.from(questionToken(q));
  const supplied = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
export const liveConsultation = (c: ConsultationCase) =>
  c.rfp.status === 'sent' && ['requested', 'reviewing', 'quoted'].includes(c.review.status);
export const dueLabel = (d: Date) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(d);
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
type Role = 'rep' | 'buyer' | 'question' | 'pg-admin' | 'ops';

export function assignmentSummaryText(
  c: ConsultationCase,
  creator?: { name: string; email: string; phone: string | null },
) {
  const terms = migrateCurrentTerms(c.rfp.terms);
  return [
    c.rfp.title,
    terms.expectedVolume
      ? '구매사가 적은 예상 월 PG 거래액 ' + VOLUME_LABELS[terms.expectedVolume]
      : '전년도 월 평균 PG 거래액 ' + (terms.monthlyAvgPgVolume ?? '미제공') + '원',
    creator
      ? [creator.name, creator.email, creator.phone].filter(Boolean).join(' · ')
      : '요청 작성자 연락처 제공이 종료됐어요.',
    '첫 연락 기한 ' + dueLabel(c.assignment.contactDue),
    '견적 마감 ' + dueLabel(c.rfp.deadline),
    '구매사에 연락한 뒤 첫 연락을 기록해주세요.',
  ].join('\n');
}
function noticeHtml(body: string, url?: string, question = false) {
  const text = '<p>' + escapeHtml(body).replace(/\n/g, '<br>') + '</p>';
  return url
    ? text +
        '<p><a href="' +
        escapeHtml(url) +
        '">' +
        (question ? '연락 수신 여부 답하기' : '상담 확인하기') +
        '</a></p>'
    : text;
}
export async function caseNotice(
  tx: Tx,
  c: ConsultationCase,
  role: Role,
  recipients: NotifyRecipient[],
  key: string,
  title: string,
  body: string,
  options: { question?: ContactQuestion; assignmentAlimtalk?: boolean } = {},
): Promise<Notification[]> {
  if (!recipients.length) return [];
  const pg = role === 'rep' || role === 'pg-admin';
  const link = pg ? '/inbox/' + c.rfp.code : '/rfp/' + c.rfp.code;
  const url = options.question
    ? baseUrlFor('buyer') +
      '/contact-confirm/' +
      options.question.id +
      '#' +
      questionToken(options.question)
    : baseUrlFor(pg ? 'pg' : 'buyer') + link;
  const identity = [c.review.id, c.assignment.revision, role, key];
  return notify(tx, {
    recipients,
    channels:
      role === 'ops'
        ? ['email']
        : options.assignmentAlimtalk
          ? ['inapp', 'email', 'alimtalk']
          : ['inapp', 'email'],
    type: 'rfp.consultation',
    title,
    body: role === 'rep' ? `${c.rfp.code} 상담 내용을 확인해주세요.` : body,
    linkUrl: link,
    alimtalk: options.assignmentAlimtalk
      ? {
          template: 'pgAssignment',
          eventKey: JSON.stringify(identity),
          rfpCode: c.rfp.code,
          assignment: { title: c.rfp.title.slice(0, 100), due: dueLabel(c.assignment.contactDue) },
          linkUrl: url,
        }
      : undefined,
    email: {
      event: 'rfp.consultation',
      subject: `[서포트비 ${c.rfp.code}] ${title}`,
      html: noticeHtml(body, role === 'ops' ? undefined : url, !!options.question),
      dedupeKey: (r) => JSON.stringify([...identity, r.userId, options.question?.id ?? null]),
    },
  });
}
export async function operationNotice(
  tx: Tx,
  c: ConsultationCase,
  key: string,
  title: string,
  body: string,
) {
  const email = process.env.ADMIN_NOTIFY_EMAIL?.trim();
  if (email)
    await caseNotice(tx, c, 'ops', [{ userId: 'ops', workspaceId: null, email }], key, title, body);
}

// Every delivery attempt, including manual retries, resolves the recipient again. Only
// the service app dispatches this event type; the admin app shares the outbox.
const noticeKeySchema = z.tuple([
  z.uuid(),
  z.number().int().positive(),
  z.enum(['rep', 'buyer', 'pg-admin', 'question', 'ops']),
  z.string(),
  z.string(),
  z.uuid().nullable(),
]);
export async function prepareConsultationMail(entry: OutboxEntry): Promise<OutboxEntry | null> {
  if (entry.event !== 'rfp.consultation') return entry;
  let key: unknown;
  try {
    key = JSON.parse(entry.dedupeKey ?? '');
  } catch {
    return null;
  }
  const repo = await getConsultationRepo();
  const correction = z.tuple([z.literal('correction'), z.uuid()]).safeParse(key);
  if (correction.success) {
    const notice = await repo.correction(correction.data[1]);
    if (!notice || (await repo.policy(notice.pgId))?.managerId !== notice.managerId) return null;
    const eligible = (await repo.recipients(notice.pgId, 'pg')).some(
      (m) => m.userId === notice.managerId && m.email === entry.to,
    );
    return eligible ? entry : null;
  }
  const parsed = noticeKeySchema.safeParse(key);
  if (!parsed.success) return null;
  const [reviewId, revision, role, noticeKey, userId, questionId] = parsed.data;
  const c = await repo.case(reviewId);
  if (!c) return null;
  if (role === 'ops') return entry.to === process.env.ADMIN_NOTIFY_EMAIL?.trim() ? entry : null;
  if (!liveConsultation(c) || revision !== c.assignment.revision) return null;
  const pg = role === 'rep' || role === 'pg-admin';
  const member = (
    await repo.recipients(pg ? c.review.pgWorkspaceId : c.rfp.buyer, pg ? 'pg' : 'buyer')
  ).find((m) => m.userId === userId && m.email === entry.to);
  if (!member) return null;
  if (role === 'pg-admin') return member.role === 'admin' ? entry : null;
  if (role === 'rep') {
    if (userId !== c.assignment.assignee) return null;
    if (noticeKey.startsWith('missed-') && !(await repo.progress(reviewId))?.missed) return null;
    if (noticeKey === 'assigned') {
      const creator = (await repo.recipients(c.rfp.buyer, 'buyer')).find(
        (m) => m.userId === c.rfp.creator,
      );
      return {
        ...entry,
        html: noticeHtml(assignmentSummaryText(c, creator), baseUrlFor('pg') + '/inbox/' + c.rfp.code),
      };
    }
    return entry;
  }
  if (role === 'question') {
    const q = await repo.latest(reviewId);
    return q && q.id === questionId && !q.answer && q.recipient === userId && q.expiresAt > new Date()
      ? entry
      : null;
  }
  if (noticeKey.startsWith('switch-') && !(await repo.progress(reviewId))?.canSwitch) return null;
  return noticeKey !== 'assigned' || c.assignment.assignee ? entry : null;
}
