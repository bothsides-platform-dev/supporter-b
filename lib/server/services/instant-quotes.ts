import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { InstantAttempt } from '@/lib/db/schema/instant-quotes';
import { getNtsClient } from '@/lib/integrations/nts';
import {
  assembleTerms,
  commitment,
  inputSchema,
  instantConsentVersion,
  instantIntakeEnabled,
  instantVolumeEligible,
  needsReview,
  reviewQuestions,
  screeningSchema,
  sharing,
  type Offer,
  type Offers,
  type FixedTerms,
} from '@/lib/rfp/instant-quote';
import type { Tx } from '@/lib/server/repositories/types';
import { getPgRecommendationService } from './pg-recommendation';
import { queueInstantMail } from './instant-quote-mail';
import type { Actor } from './types';

import {
  buyerIdentity,
  configs,
  draftAccess,
  previewTier,
  history,
  instantDb,
  loadInstant,
  lockMatching,
  lockDraft,
  insertRequest,
  completeDraft,
  insertAttempt,
  updateAttempt,
  startSigning,
} from '../repositories/drizzle/instant-quotes';
import { deny } from './instant-error';
import { canonical, instantProof } from './instant-proof';
export { InstantError } from './instant-error';
export {
  buyerIdentity,
  instantDb,
  loadInstant,
} from '../repositories/drizzle/instant-quotes';

const day = 86_400_000;
const later = (now: Date, days: number) => new Date(+now + days * day);
export function secureSignup(raw: string) {
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search
    );
  } catch {
    return false;
  }
}
export const previewSchema = z
  .object({
    key: z.uuid(),
    input: inputSchema,
    screen: screeningSchema.partial(),
    previous: z.uuid().optional(),
  })
  .strict();
type PreviewInput = z.infer<typeof previewSchema>;
type Candidate = Offer & {
  terms: FixedTerms;
  recipient: string;
  signupUrl: string;
  channelRevision: number;
};
async function choices(
  tx: Tx,
  data: PreviewInput,
  priorPgs: string[],
  now: Date,
  expires?: number,
  lock = false,
) {
  const { key, input, screen } = data;
  const result: {
    risk: string;
    offers: Candidate[];
    questions: Offers['questions'];
  } = { risk: 'unconfigured', offers: [], questions: [] };
  if (!instantIntakeEnabled() || !instantVolumeEligible(input)) return result;
  const selection = {
    kind: 'selection' as const,
    industry: input.groupId
      ? { industryGroupId: input.groupId }
      : { customIndustryName: input.customIndustry },
    currentPgs: input.currentPgs,
    includeTestPg: false,
  };
  const service = await getPgRecommendationService();
  let match = await service.recommend(selection, tx);
  if (!match.ok || !match.industry.groupId) return result;
  const group = match.industry.groupId;
  if (lock) {
    await lockMatching(tx, group);
    match = await service.recommend(selection, tx);
    if (!match.ok || match.industry.groupId !== group) return result;
  }
  result.risk = match.recommendation.risk;
  if (result.risk !== 'white' || match.recommendation.source === 'default')
    return result;
  const available = await configs(tx, group, lock);
  const tier = await previewTier(tx, key, input, now);
  for (const { pgWorkspaceId: id } of match.recommendation.candidates) {
    const row = available.find((r) => r.channel.pgId === id);
    if (
      !row ||
      priorPgs.includes(id) ||
      !secureSignup(row.channel.signupUrl) ||
      !z.email().safeParse(row.channel.recipient).success
    )
      continue;
    const terms = assembleTerms(
      id,
      row.name,
      row.policy.version,
      row.policy.policy,
      row.rates.version,
      row.rates.rates,
      row.industry,
    );
    if (
      !terms ||
      input.methods.some((m) => terms.fees[m] === undefined) ||
      needsReview(terms.policy.review, screen)
    )
      continue;
    const questions = reviewQuestions(terms.policy.review);
    const missing = questions.filter((k) => screen[k] === undefined);
    if (missing.length) {
      result.questions = [...new Set([...result.questions, ...missing])];
      continue;
    }
    const until = expires ?? +later(now, terms.policy.validityDays);
    const stamp = instantProof([
      'instant-offer-v1',
      key,
      input,
      data.previous ?? null,
      terms,
      tier,
      row.channel,
      until,
      questions.map((k) => screen[k]),
      instantConsentVersion,
    ]);
    result.offers.push({
      terms,
      tier,
      stamp,
      expires: until,
      recipient: row.channel.recipient,
      signupUrl: row.channel.signupUrl,
      channelRevision: row.channel.revision,
    });
  }
  return result;
}
function retry(
  previous: string | undefined,
  active: InstantAttempt | undefined,
  now: Date,
) {
  if (
    !previous ||
    active?.id !== previous ||
    active.decision !== 'declined' ||
    active.buyerEnrolledAt ||
    +active.retryUntil <= +now
  )
    deny('현재 신청 상태나 재신청 기한을 확인해주세요.');
}
export async function previewInstant(
  raw: unknown,
  secret?: string,
  actor?: Actor,
): Promise<Offers> {
  const data = previewSchema.parse(raw),
    tx = await instantDb(),
    now = new Date();
  let priorPgs: string[] = [];
  if (data.previous) {
    if (!actor) deny('로그인이 필요해요.');
    await buyerIdentity(tx, actor);
    const h = await history(tx, data.key, actor);
    retry(data.previous, h.active, now);
    data.input = h.request!.input;
    priorPgs = h.all.map((a) => a.pgId);
  } else await draftAccess(tx, data.key, data.input, secret, actor);
  const r = await choices(tx, data, priorPgs, now);
  return {
    ...r,
    offers: r.offers.map(({ terms, tier, stamp, expires }) => ({
      terms: {
        ...terms,
        policy: {
          terms: terms.policy.terms,
          direct: terms.policy.direct,
          validityDays: terms.policy.validityDays,
        },
      },
      tier,
      stamp,
      expires,
    })),
  };
}
export const confirmSchema = previewSchema.extend({
  screen: screeningSchema,
  pgId: z.uuid(),
  stamp: z.string().length(43),
  expires: z.number().int().positive(),
  agree: z.literal(true),
  share: z.literal(true),
  consentVersion: z.literal(instantConsentVersion),
});
export async function confirmInstant(
  raw: unknown,
  actor: Actor,
  secret?: string,
) {
  const data = confirmSchema.parse(raw),
    db = await instantDb();
  const person = await buyerIdentity(db, actor);
  if (person.bizNo !== data.input.business.bizNo || !person.phone)
    deny('신청 회사의 사업자번호와 작성자 전화번호를 확인해주세요.');
  const nts = await getNtsClient()
    .lookup(person.bizNo, { pool: 'write', requireEcho: true })
    .catch(() => undefined);
  if (!nts?.valid || nts.status !== 'active')
    deny('국세청에서 정상 영업을 확인한 뒤 신청할 수 있어요.');
  return db.transaction(async (tx) => {
    const now = new Date();
    const who = await buyerIdentity(tx, actor, true);
    if (who.bizNo !== data.input.business.bizNo || !who.phone)
      deny('신청자 정보가 바뀌었어요.');
    // The owned draft serializes first submission, including a racing consultation reservation.
    let h = await history(tx, data.key, actor, true);
    if (h.active?.stamp === data.stamp && h.active.pgId === data.pgId)
      return { id: h.active.id };
    if (!data.previous) {
      if (!h.request) {
        const draft = await lockDraft(tx, data.key);
        if (!draft) deny('초안을 확인해주세요.');
        h = await history(tx, data.key, actor, true);
        if (h.active?.stamp === data.stamp && h.active.pgId === data.pgId)
          return { id: h.active.id };
      }
      if (h.request) deny('이미 확정한 신청을 확인해주세요.');
      await draftAccess(tx, data.key, data.input, secret, actor, true);
    } else {
      retry(data.previous, h.active, now);
      if (canonical(h.request!.input) !== canonical(data.input))
        deny('기존 신청 정보가 바뀌었어요.');
    }
    if (data.expires <= +now)
      deny('견적이 만료됐어요. 새 견적을 확인하고 다시 동의해주세요.');
    const options = await choices(
      tx,
      data,
      h.all.map((a) => a.pgId),
      now,
      data.expires,
      true,
    );
    const offer = options.offers.find(
      (o) => o.terms.pgId === data.pgId && o.stamp === data.stamp,
    );
    if (!offer || data.expires <= Date.now())
      deny('견적 조건이 바뀌었어요. 최신 조건표를 확인하고 다시 동의해주세요.');
    const request =
      h.request ??
      (await insertRequest(tx, {
        requestKey: data.key,
        buyerId: actor.workspaceId,
        creator: actor.userId,
        input: data.input,
      }));
    if (h.active) await updateAttempt(tx, h.active.id, { closedAt: now });
    else await completeDraft(tx, data.key, actor, now);
    const id = randomUUID(),
      p = offer.terms.policy;
    const attempt = await insertAttempt(tx, {
      id,
      requestId: request.id,
      pgId: data.pgId,
      code: 'Q-' + id.toUpperCase(),
      stamp: offer.stamp,
      terms: offer.terms,
      screening: data.screen,
      applicant: {
        company: who.company,
        name: who.name,
        email: who.email,
        phone: who.phone,
      },
      consent: commitment + ' ' + sharing(offer.terms.pgName),
      consentBy: actor.userId,
      consentVersion: instantConsentVersion,
      consentAt: now,
      validUntil: later(now, p.validityDays),
      retryUntil: later(now, p.retryDays),
      ackDue: later(now, p.ackDays),
      applyDue: later(now, p.applicationDays),
      resultDue: later(now, p.resultDays),
      recipient: offer.recipient,
      channelRevision: offer.channelRevision,
      signupUrl: offer.signupUrl,
    });
    await queueInstantMail(tx, attempt, 'pg', 'issued');
    await queueInstantMail(tx, attempt, 'buyer', 'issued');
    return { id };
  });
}
export async function buyerUpdate(
  id: string,
  actor: Actor,
  action: 'visit' | 'applied' | 'enrolled' | 'match' | 'differ' | 'agreement',
  reported = '',
) {
  const db = await instantDb();
  return db.transaction(async (tx) => {
    const who = await buyerIdentity(tx, actor, true);
    const row = await loadInstant(tx, id, true);
    if (
      !row ||
      row.r.buyerId !== actor.workspaceId ||
      row.r.creator !== actor.userId ||
      row.a.closedAt
    )
      deny('이 신청을 변경할 수 없어요.');
    const { a } = row,
      now = new Date();
    if (action === 'visit') {
      if (+a.validUntil <= +now || a.decision === 'declined')
        deny('가입 링크가 종료됐어요.');
      const url = new URL(a.signupUrl);
      url.searchParams.set('quote', a.code);
      if (!a.visitedAt) await updateAttempt(tx, id, { visitedAt: now });
      return { url: url.href };
    }
    if (a.decision === 'declined') deny('PG가 거절한 신청이에요.');
    if (action === 'applied' || action === 'enrolled') {
      const field = action === 'applied' ? 'buyerAppliedAt' : 'buyerEnrolledAt';
      if (!a[field]) await updateAttempt(tx, id, { [field]: now });
      return {};
    }
    if (!a.buyerEnrolledAt && a.decision !== 'approved')
      deny('먼저 PG 가입 완료를 확인해주세요.');
    if (action === 'agreement') {
      if (who.status !== 'active')
        deny('구매사 입점 승인 후 합의서를 작성할 수 있어요.');
      if (!a.selectedAt) {
        await updateAttempt(tx, id, {
          selectedAt: now,
          selectedBy: actor.userId,
        });
        await startSigning(tx, id, actor);
      }
      return {};
    }
    if (!a.tier) deny('PG가 적용 등급을 확인하고 있어요.');
    if (a.checkedAt) return {};
    if (action === 'differ' && (!reported.trim() || reported.length > 1500))
      deny('실제 적용 조건과 차이를 적어주세요.');
    await updateAttempt(tx, id, {
      checkedAt: now,
      differs: action === 'differ',
      reported: action === 'differ' ? reported.trim() : null,
    });
    if (action === 'differ') await queueInstantMail(tx, a, 'ops', 'correction');
    return {};
  });
}
