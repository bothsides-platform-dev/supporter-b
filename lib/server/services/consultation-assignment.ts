import { businessDeadline } from '@/lib/rfp/business-deadline';
import {
  CONTACT_CONSENT_VERSION,
  contactConsentText,
  hasContactConsent,
  type ContactConsent,
} from '@/lib/rfp/assignment';
import { kstDateOf } from '@/lib/utils/deadline';
import { getBusinessCalendarRepo, getConsultationRepo } from '../repositories/factory';
import type { Tx } from '../repositories/types';
import type { AssignmentPolicy, ConsultationCase } from '../repositories/drizzle/consultation';
import { assignmentSummaryText, caseNotice, operationNotice, dueLabel } from './consultation-notices';
import type { Notification } from '@/lib/types/notification';

export async function businessDue(now: Date, days: number, tx: Tx) {
  const calendars = await getBusinessCalendarRepo();
  const from = kstDateOf(now);
  let calendar = await calendars.read(from, from, tx);
  if (calendar) {
    try {
      return new Date(businessDeadline(now, days, calendar));
    } catch {
      /* Cross-year deadline. */
    }
    calendar = await calendars.read(from, String(Number(from.slice(0, 4)) + 1) + '-12-31', tx);
    if (calendar) return new Date(businessDeadline(now, days, calendar));
  }
  throw new Error('CALENDAR_UNAVAILABLE');
}
export async function prepareAssignment(
  pgId: string,
  groupId: string | null,
  size: '50m' | '100m',
  consent: ContactConsent | undefined,
  actor: { userId: string; workspaceId: string },
  tx: Tx,
) {
  const repo = await getConsultationRepo();
  const policy = await repo.policy(pgId, tx);
  if (!policy?.enabled) return { ok: true as const, plan: null };
  if (!hasContactConsent(consent, pgId))
    return { ok: false as const, error: 'MATCHING_CONTACT_CONSENT' };
  const buyer = await repo.recipients(actor.workspaceId, 'buyer', tx);
  if (!buyer.some((m) => m.userId === actor.userId))
    return { ok: false as const, error: 'FORBIDDEN_BUYER' };
  const members = await repo.recipients(pgId, 'pg', tx);
  const match = policy.roster.find(
    (rule) =>
      (!rule.groupId || rule.groupId === groupId) &&
      (!rule.size || rule.size === size) &&
      members.some((m) => m.userId === rule.userId),
  );
  let due: Date;
  try {
    due = await businessDue(new Date(), policy.contactDays, tx);
  } catch {
    return { ok: false as const, error: 'CALENDAR_UNAVAILABLE' };
  }
  return { ok: true as const, plan: { policy, assignee: match?.userId ?? null, due } };
}
export async function createAssignment(
  reviewId: string,
  plan: { policy: AssignmentPolicy; assignee: string | null; due: Date },
  quoteDue: Date,
  pgName: string,
  consentBy: string,
  consentAt: Date,
  tx: Tx,
) {
  const repo = await getConsultationRepo();
  await repo.start(
    {
      reviewId,
      assignee: plan.assignee,
      contactDue: plan.due,
      quoteDue,
      consentBy,
      consentAt,
      consentVersion: CONTACT_CONSENT_VERSION,
      consentText: contactConsentText(pgName),
    },
    tx,
  );
  await repo.event(reviewId, 'assignment-1', plan.assignee ?? '미배정', tx);
  const c = await repo.case(reviewId, tx);
  return deliverAssignment(c, tx);
}
export async function deliverAssignment(c: ConsultationCase, tx: Tx) {
  const repo = await getConsultationRepo();
  const a = c.assignment;
  if (a.notifiedRevision >= a.revision) return [];
  const reps = await repo.recipients(c.review.pgWorkspaceId, 'pg', tx);
  const rep = reps.find((m) => m.userId === a.assignee);
  const pending: Notification[] = [];
  if (rep) {
    const buyers = await repo.recipients(c.rfp.buyer, 'buyer', tx);
    const creator = buyers.find((m) => m.userId === c.rfp.creator);
    const summary = assignmentSummaryText(c, creator);
    const policy = await repo.policy(c.review.pgWorkspaceId, tx);
    pending.push(
      ...(await caseNotice(tx, c, 'rep', [rep], 'assigned', '상담이 배정됐어요', summary, {
        assignmentAlimtalk: policy?.alimtalkReady,
      })),
    );
    pending.push(
      ...(await caseNotice(
        tx,
        c,
        'buyer',
        buyers,
        'assigned',
        'PG 담당자가 배정됐어요',
        c.review.candidate.name + '에서 ' + dueLabel(a.contactDue) + '까지 처음 연락드려요.',
      )),
    );
  } else {
    await operationNotice(
      tx,
      c,
      'unassigned',
      '담당자를 배정해주세요',
      c.rfp.code + ' ' + c.review.candidate.name + '에 배정할 담당자가 없어요.',
    );
  }
  await repo.notified(c.review.id, a.revision, tx);
  return pending;
}
