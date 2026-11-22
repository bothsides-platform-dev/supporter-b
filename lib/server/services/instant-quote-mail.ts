import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { InstantAttempt } from '@/lib/db/schema/instant-quotes';
import {
  queueMail,
  buyerRecipient,
  recipientLive,
  instantFollowupJobs,
  dueAttempts,
} from '../repositories/drizzle/instant-quote-delivery';
import {
  instantDb,
  loadInstant,
  updateAttempt,
} from '../repositories/drizzle/instant-quotes';
import { conditionLines, feeRows, volumeText } from '@/lib/rfp/instant-quote';
import {
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  PAYMENT_METHOD_LABELS,
  type MerchantTier,
} from '@/lib/types/bid';
import { productInfoRows } from '@/lib/rfp/product-info';
import { baseUrlFor } from '@/lib/server/env';
import type { Tx } from '@/lib/server/repositories/types';
import type { OutboxEntry } from '@/lib/server/outbox/types';
import { instantProof } from './instant-proof';

type Role = 'buyer' | 'pg' | 'ops';
export type PgStep = 'receipt' | 'application' | 'result';
const steps = ['receipt', 'application', 'result'] as const;
const labels = {
  receipt: '받았어요',
  application: '외부 신청 확인',
  result: '심사 결과 회신',
};
const titles = {
  issued: 'PG 가입 견적과 전용 가입 안내',
  ack: 'PG 수신 확인 요청',
  application: 'PG 사이트에서 가입 신청을 마치셨나요?',
  result: 'PG 가입을 완료하셨나요?',
  check: '견적 조건이 그대로 적용됐나요?',
  correction: 'PG 적용 조건 정정 요청',
  decision: 'PG 심사 결과와 다음 신청 안내',
  correct: '약정 조건 정정 요청',
};
type Notice = keyof typeof titles;
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
const link = (text: string, url: string) =>
  '<p><a href="' + esc(url) + '">' + esc(text) + '</a></p>';
const until = (a: InstantAttempt) =>
  +a.consentAt + a.terms.policy.responseDays * 86400000;
export function pgProof(a: InstantAttempt, step: PgStep) {
  return instantProof([
    'instant-pg-response-v1',
    a.id,
    a.pgId,
    step,
    a.recipient,
    a.channelRevision,
    until(a),
  ]);
}
export async function queueInstantMail(
  tx: Tx,
  a: InstantAttempt,
  role: Role,
  notice: Notice,
) {
  const to =
    role === 'pg'
      ? a.recipient
      : role === 'buyer'
        ? a.applicant.email
        : process.env.ADMIN_NOTIFY_EMAIL?.trim();
  if (!to) return;
  // Sensitive bodies and bearer links are materialized only after recipient revalidation.
  await queueMail(
    tx,
    to,
    '[서포트비 ' + a.code + '] ' + titles[notice],
    ['instant', a.id, role, notice].join(':'),
  );
}
export async function prepareInstantMail(
  entry: OutboxEntry,
): Promise<OutboxEntry | null> {
  if (entry.event !== 'pg.instant_quote') return entry;
  const [prefix, id, role, kind] = entry.dedupeKey?.split(':') ?? [];
  if (
    prefix !== 'instant' ||
    !z.uuid().safeParse(id).success ||
    !Object.hasOwn(titles, kind)
  )
    return null;
  const tx = await instantDb(),
    row = await loadInstant(tx, id);
  if (!row || row.a.closedAt) return null;
  const { a, r } = row;
  if (role === 'ops')
    return entry.to !== process.env.ADMIN_NOTIFY_EMAIL?.trim()
      ? null
      : {
          ...entry,
          html: '<p>' + esc(a.code + ' · ' + titles[kind as Notice]) + '</p>',
        };
  if (role === 'pg') {
    if (
      !(await recipientLive(tx, a)) ||
      entry.to !== a.recipient ||
      (kind === 'ack' && a.ackAt)
    )
      return null;
  } else if (role === 'buyer') {
    const u = await buyerRecipient(tx, r.creator);
    if (
      !u?.emailVerified ||
      u.deletedAt ||
      u.status !== 'active' ||
      u.email !== entry.to ||
      a.applicant.email !== entry.to
    )
      return null;
    if (
      (kind === 'application' &&
        (a.appliedAt || a.buyerAppliedAt || a.resultAt || a.buyerEnrolledAt)) ||
      (kind === 'result' && (a.resultAt || a.buyerEnrolledAt)) ||
      (kind === 'check' && a.checkedAt)
    )
      return null;
  } else return null;
  const t = a.terms;
  const lines = [
    a.code +
      ' · ' +
      t.pgName +
      ' · 약정 ' +
      t.policyVersion +
      '판 / 표준 ' +
      t.rateVersion +
      '판',
    '가입 신청 유효기간 ' +
      a.validUntil.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) +
      ' (한국시간)',
    r.input.contractType === 'new' ? '첫 PG 계약' : '기존 PG 계약 갱신',
    ...(t.industry ? ['업종 · ' + t.industry] : []),
    '요청 결제수단 · ' +
      r.input.methods.map((m) => PAYMENT_METHOD_LABELS[m]).join(', '),
    volumeText(r.input),
    '결제수수료 (부가세 별도) · 홈페이지 판가 → 약정가',
    ...feeRows(t).map((f) => f.label + ' ' + f.standard + ' → ' + f.value),
    ...conditionLines(t, r.input).map((pair) => pair.join(' · ')),
    a.consent,
  ];
  if (role === 'buyer' && kind === 'check' && a.tier)
    lines.unshift(
      t.pgName +
        '에서 ' +
        MERCHANT_TIER_LABELS[a.tier] +
        ' 등급으로 가입을 승인했어요. 내 신청에서 이 등급의 약정가와 실제 적용 조건을 확인해주세요.',
    );
  if (role === 'buyer' && kind === 'decision')
    lines.unshift(
      t.pgName +
        '에서 가입을 거절했어요. ' +
        a.retryUntil.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) +
        '까지 내 신청에서 다음 PG의 견적을 확인할 수 있어요.',
    );
  if (role === 'buyer' && (kind === 'application' || kind === 'result'))
    lines.unshift(titles[kind] + ' 내 신청에서 진행 상태를 알려주세요.');
  if (role === 'pg')
    lines.push(
      '사업자등록번호 ' + r.input.business.bizNo,
      a.applicant.company,
      a.applicant.name + ' · ' + a.applicant.email + ' · ' + a.applicant.phone,
      r.input.business.website,
      r.input.products,
      ...productInfoRows(a.screening)
        .filter((x) => x[1])
        .map((x) => x.join(' · ')),
      '배송·서비스 기간 ' + a.screening.deliveryDays + '일',
      '외부 접수에서 사업자등록번호와 견적번호를 대조하고 심사 등급에 맞는 약정가를 적용해주세요.',
    );
  if (kind === 'correct' && role === 'pg')
    lines.push(
      '구매사가 알린 실제 조건 · ' + (a.reported ?? ''),
      '확인 등급 · ' + (a.tier ? MERCHANT_TIER_LABELS[a.tier] : '확인 전'),
      '이 메일의 견적번호로 대조하고 운영 담당자에게 정정 결과를 알려주세요.',
    );
  const buyerPath = baseUrlFor('buyer') + '/instant-quotes/' + id;
  const links =
    role === 'buyer'
      ? link('내 신청과 가입 링크 확인', buyerPath)
      : (kind === 'correct'
          ? []
          : kind === 'ack'
            ? (['receipt'] as const)
            : steps
        )
          .map((s) =>
            link(
              labels[s],
              baseUrlFor('buyer') +
                '/contact-confirm/instant/' +
                id +
                '/' +
                s +
                '#' +
                pgProof(a, s),
            ),
          )
          .join('');
  return {
    ...entry,
    html: '<p>' + lines.map(esc).join('<br>') + '</p>' + links,
  };
}
export async function pgReply(
  id: string,
  step: PgStep,
  token: string,
  input: {
    code?: string | null;
    bizNo?: string | null;
    decision?: string | null;
    tier?: string | null;
  },
) {
  if (
    !z.uuid().safeParse(id).success ||
    !steps.includes(step) ||
    !/^[\w-]{43}$/.test(token)
  )
    return false;
  return (await instantDb()).transaction(async (tx) => {
    const row = await loadInstant(tx, id, true);
    if (!row || row.a.closedAt || !(await recipientLive(tx, row.a)))
      return false;
    const { a, r } = row,
      now = new Date();
    if (
      +now >= until(a) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(pgProof(a, step)))
    )
      return false;
    let patch: Partial<InstantAttempt>;
    if (step === 'receipt') {
      if (a.ackAt) return true;
      patch = { ackAt: now };
    } else if (step === 'application') {
      if (
        input.code?.trim() !== a.code ||
        input.bizNo?.replace(/-/g, '') !== r.input.business.bizNo
      )
        return false;
      if (a.appliedAt) return true;
      patch = { appliedAt: now };
    } else {
      if (
        !a.appliedAt ||
        (input.decision !== 'approved' && input.decision !== 'declined')
      )
        return false;
      const tier =
        input.decision === 'approved'
          ? z.enum(MERCHANT_TIERS).safeParse(input.tier).data
          : null;
      if (input.decision === 'approved' && !tier) return false;
      if (a.resultAt) return a.decision === input.decision && a.tier === tier;
      if (input.decision === 'declined' && a.buyerEnrolledAt) return false;
      patch = {
        decision: input.decision,
        tier: tier as MerchantTier | null,
        resultAt: now,
        retryUntil: new Date(+now + a.terms.policy.retryDays * 86400000),
      };
    }
    const updated = await updateAttempt(tx, id, patch);
    if (step === 'result')
      await queueInstantMail(
        tx,
        updated,
        'buyer',
        updated.decision === 'approved' ? 'check' : 'decision',
      );
    return true;
  });
}
export async function runInstantFollowups(now = new Date()) {
  const db = await instantDb();
  let queued = 0;
  for (const job of instantFollowupJobs) {
    queued += await db.transaction(async (tx) => {
      const pending = await dueAttempts(tx, job, now);
      for (const a of pending) {
        await queueInstantMail(tx, a, job.role, job.notice);
        if (job.notice === 'ack') await queueInstantMail(tx, a, 'ops', 'ack');
      }
      return pending.length;
    });
  }
  return queued;
}
