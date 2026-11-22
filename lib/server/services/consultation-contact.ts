import { randomUUID } from 'node:crypto';
import { getDb, getConsultationRepo, getRfpRepo } from '../repositories/factory';
import type { Tx } from '../repositories/types';
import type { ConsultationCase, ContactQuestion } from '../repositories/drizzle/consultation';
import type { Actor, ServiceResult } from './types';
import type { Notification } from '@/lib/types/notification';
import type { AssignmentSummary } from '@/lib/rfp/assignment';
import { businessDue } from './consultation-assignment';
import {
  caseNotice,
  operationNotice,
  liveConsultation,
  validQuestionToken,
} from './consultation-notices';
import { emitAfterCommit } from '../notifications/dispatch';
import { flushAfterCommit } from '../outbox/post-commit';

export async function lockConsultation(reviewId: string, tx: Tx) {
  const repo = await getConsultationRepo();
  const before = await repo.case(reviewId, tx);
  if (!before) return null;
  await (await getRfpRepo()).findByIdForUpdate(before.rfp.id, tx);
  return repo.case(reviewId, tx);
}

export async function consultationSummary(
  reviewId: string,
  actor: Actor,
  type: 'buyer' | 'pg',
): Promise<AssignmentSummary | undefined> {
  const repo = await getConsultationRepo();
  const c = await repo.case(reviewId);
  if (!c || actor.workspaceId !== (type === 'buyer' ? c.rfp.buyer : c.review.pgWorkspaceId)) return;
  const [state, q] = await Promise.all([repo.progress(reviewId), repo.latest(reviewId)]);
  const canAnswer =
    type === 'buyer' &&
    liveConsultation(c) &&
    q?.recipient === actor.userId &&
    !q.answer &&
    q.revision === c.assignment.revision &&
    q.expiresAt > new Date();
  return {
    due: c.assignment.contactDue.toISOString(),
    assigned: !!c.assignment.assignee,
    contactAt: state?.firstContactAt?.toISOString() ?? null,
    canSwitch: type === 'buyer' && !!state?.canSwitch,
    questionId: canAnswer ? q.id : undefined,
    reportAfter: type === 'pg' && actor.userId === c.assignment.assignee ? q?.id : undefined,
    canReport:
      type === 'pg' &&
      liveConsultation(c) &&
      actor.userId === c.assignment.assignee &&
      (!q || (q.answer === 'missed' && state?.missed) || q.revision !== c.assignment.revision),
  };
}

export async function askBuyer(c: ConsultationCase, q: ContactQuestion, tx: Tx, reminder = false) {
  const repo = await getConsultationRepo();
  const member = (await repo.recipients(c.rfp.buyer, 'buyer', tx)).filter(
    (m) => m.userId === q.recipient,
  );
  return caseNotice(
    tx,
    c,
    'question',
    member,
    reminder ? 'reminder' : 'question',
    '연락 받으셨나요?',
    c.review.candidate.name + '에서 연락을 받으셨는지 알려주세요.',
    { question: q },
  );
}

// The caller holds the RFP row lock. Attaching a message to a phone report keeps its original time.
async function recordReport(
  c: ConsultationCase,
  actor: Actor,
  tx: Tx,
  now: Date,
  emits: Notification[],
  messageId?: string,
) {
  const repo = await getConsultationRepo();
  if (
    !liveConsultation(c) ||
    c.review.pgWorkspaceId !== actor.workspaceId ||
    c.assignment.assignee !== actor.userId
  )
    return false;
  if (!(await repo.recipients(actor.workspaceId, 'pg', tx)).some((m) => m.userId === actor.userId))
    return false;
  const q = await repo.latest(c.review.id, tx);
  if (
    q &&
    q.revision === c.assignment.revision &&
    (q.answer !== 'missed' || !(await repo.progress(c.review.id, tx))?.missed)
  ) {
    if (messageId && !q.messageId) await repo.updateQuestion(q.id, { messageId }, tx);
    return true;
  }
  const remindAt = await businessDue(now, 1, tx);
  const created = await repo.ask(
    {
      id: randomUUID(),
      reviewId: c.review.id,
      revision: c.assignment.revision,
      reportedBy: actor.userId,
      recipient: c.rfp.creator,
      messageId,
      reportedAt: now,
      remindAt,
      expiresAt: new Date(Math.max(remindAt.getTime(), now.getTime()) + 7 * 86400_000),
    },
    tx,
  );
  emits.push(...(await askBuyer(c, created, tx)));
  return true;
}

export async function reportContact(
  reviewId: string,
  actor: Actor,
  expectedQuestion: string | null,
): Promise<ServiceResult> {
  const emits: Notification[] = [];
  const db = await getDb();
  const recorded = await db.transaction(async (tx: Tx) => {
    const c = await lockConsultation(reviewId, tx);
    if (!c) return false;
    const q = await (await getConsultationRepo()).latest(reviewId, tx);
    if (q?.answer === 'missed' && q.id !== expectedQuestion) return false;
    return recordReport(c, actor, tx, new Date(), emits);
  });
  if (!recorded) return { ok: false, error: 'MATCHING_REVIEW_CLOSED' };
  emitAfterCommit(emits);
  flushAfterCommit();
  return { ok: true };
}

export async function notifyAvailableSwitch(
  c: ConsultationCase,
  questionId: string | undefined,
  tx: Tx,
) {
  const repo = await getConsultationRepo();
  const key = 'switch-' + (questionId ?? 'due');
  if (!(await repo.event(c.review.id, key, '', tx))) return [];
  const buyers = await repo.recipients(c.rfp.buyer, 'buyer', tx);
  return caseNotice(
    tx,
    c,
    'buyer',
    buyers,
    key,
    '다음 PG사를 선택할 수 있어요',
    c.rfp.code + '의 첫 연락 기한이 지났어요. 상담 상세에서 다음 PG사를 선택할 수 있어요.',
  );
}

export async function answerContact(
  id: string,
  received: boolean,
  proof: { actor: Actor } | { token: string },
): Promise<ServiceResult> {
  const repo = await getConsultationRepo();
  const db = await getDb();
  const emits: Notification[] = [];
  const ok = await db.transaction(async (tx: Tx) => {
    const before = await repo.question(id, tx);
    if (!before) return false;
    const c = await lockConsultation(before.reviewId, tx);
    if (!c || !liveConsultation(c)) return false;
    const q = await repo.latest(c.review.id, tx);
    const now = new Date();
    if (
      !q ||
      q.id !== id ||
      q.expiresAt <= now ||
      q.revision !== c.assignment.revision ||
      q.recipient !== c.rfp.creator
    )
      return false;
    if (
      'token' in proof
        ? !validQuestionToken(q, proof.token)
        : proof.actor.userId !== q.recipient || proof.actor.workspaceId !== c.rfp.buyer
    )
      return false;
    if (!(await repo.recipients(c.rfp.buyer, 'buyer', tx)).some((m) => m.userId === q.recipient))
      return false;
    const answer = received ? 'received' : 'missed';
    if (q.answer) return q.answer === answer;
    await repo.updateQuestion(
      id,
      { answer, answeredAt: now, channel: 'token' in proof ? 'email' : 'app' },
      tx,
    );
    if (!received) {
      const reps = (await repo.recipients(c.review.pgWorkspaceId, 'pg', tx)).filter(
        (m) => m.userId === c.assignment.assignee,
      );
      emits.push(
        ...(await caseNotice(
          tx,
          c,
          'rep',
          reps,
          'missed-' + q.id,
          '구매사에게 다시 연락해주세요',
          c.rfp.code + ' 요청 작성자가 연락을 받지 못했다고 답했어요.',
        )),
      );
      await operationNotice(
        tx,
        c,
        'missed-' + q.id,
        '첫 연락 기록을 확인해주세요',
        c.rfp.code + ' 첫 연락 기록과 구매사 응답이 달라요.',
      );
      if ((await repo.progress(c.review.id, tx))?.canSwitch)
        emits.push(...(await notifyAvailableSwitch(c, q.id, tx)));
    }
    return true;
  });
  if (!ok) return { ok: false, error: 'CONTACT_QUESTION_CLOSED' };
  emitAfterCommit(emits);
  flushAfterCommit();
  return { ok: true };
}

type ThreadContext = { conversationId: string; buyerId: string; pgId: string };
export async function recordConsultationMessage(
  thread: ThreadContext,
  rfpId: string | null,
  actor: Actor,
  messageId: string,
  at: Date,
  tx: Tx,
  emits: Notification[],
) {
  const repo = await getConsultationRepo();
  if (actor.workspaceId === thread.pgId && rfpId) {
    const reviewId = await repo.forPg(rfpId, thread.pgId, tx);
    if (!reviewId) return;
    const c = await lockConsultation(reviewId, tx);
    if (c?.rfp.buyer === thread.buyerId) await recordReport(c, actor, tx, new Date(), emits, messageId);
    return;
  }
  if (actor.workspaceId !== thread.buyerId) return;
  let contacts = await repo.threadContacts(thread.conversationId, at, tx);
  if (rfpId) contacts = contacts.filter((contact) => contact.rfpId === rfpId);
  else {
    // An untagged reply is attributable only when it directly follows the tagged first contact.
    const previous = await repo.previousMessage(thread.conversationId, messageId, at, tx);
    contacts = contacts.filter((contact) => contact.messageId === previous?.id);
  }
  if (contacts[0]) await observeContact(contacts[0], actor, 'reply-' + messageId, new Date(), tx);
}

type ObservedContact = { reviewId: string; questionId: string };
async function observeContact(contact: ObservedContact, actor: Actor, key: string, at: Date, tx: Tx) {
  const repo = await getConsultationRepo();
  const c = await lockConsultation(contact.reviewId, tx);
  if (!c || !liveConsultation(c) || c.rfp.buyer !== actor.workspaceId) return;
  const q = await repo.latest(contact.reviewId, tx);
  if (!q || q.id !== contact.questionId || q.revision !== c.assignment.revision) return;
  if ((await repo.recipients(c.rfp.buyer, 'buyer', tx)).some((m) => m.userId === actor.userId))
    await repo.observe(q.id, key, actor.userId, at, tx);
}

export async function observeConsultationRead(
  conversationId: string,
  actor: Actor,
  through: Date,
  at: Date,
) {
  const repo = await getConsultationRepo();
  const contacts = await repo.threadContacts(conversationId, through);
  if (!contacts.length) return;
  await (
    await getDb()
  ).transaction(async (tx: Tx) => {
    for (const contact of contacts)
      await observeContact(contact, actor, 'read-' + actor.userId, at, tx);
  });
}
