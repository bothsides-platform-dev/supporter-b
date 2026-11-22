import {
  isValidWebsiteUrl,
  normalizeWebsiteUrl,
} from '@/lib/validation/website-url';
import type { SigningRequest } from '@/lib/server/services/signing-request';
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';
import {
  bizProfiles,
  guestQuoteCalls,
  guestRfpDrafts,
  guestRfpRequests,
  instantAttempts as attempts,
  instantPgChannels as channels,
  instantPolicies as policies,
  instantRequests as requests,
  pgAgreementRates,
  pgMatchingPolicies,
  pgRecommendationGroups,
  signingContracts,
  users,
  workspaceMembers,
  workspaces,
} from '@/lib/db/schema';
import { getDb } from '../factory';
import type { Tx } from '../types';
import type { Actor } from '@/lib/server/services/types';
import { guestSecretHash } from '@/lib/server/services/guest-drafts';
import { provisionalTier } from '@/lib/server/quote-assist/savings';
import type { MerchantTier } from '@/lib/types/bid';
import type { InstantInput } from '@/lib/rfp/instant-quote';
import { deny } from '@/lib/server/services/instant-error';
import { isTestPgName } from '@/lib/features/test-pg';
export const instantDb = async (): Promise<Tx> => getDb();
export async function buyerIdentity(tx: Tx, actor: Actor, lock = false) {
  const q = tx
    .select({
      company: workspaces.name,
      status: workspaces.status,
      bizNo: bizProfiles.bizNo,
      name: users.name,
      email: users.email,
      phone: users.phone,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .innerJoin(bizProfiles, eq(bizProfiles.id, workspaces.bizProfileId))
    .where(
      and(
        eq(users.id, actor.userId),
        eq(workspaces.id, actor.workspaceId),
        eq(users.status, 'active'),
        eq(users.emailVerified, true),
        isNull(users.deletedAt),
        eq(workspaceMembers.approvalStatus, 'approved'),
        eq(workspaces.type, 'buyer'),
        inArray(workspaces.status, ['active', 'pending']),
      ),
    );
  const [row] = lock ? await q.for('share') : await q;
  if (!row) deny('이메일을 인증한 구매사 계정에서 신청해주세요.');
  return row;
}
function sameItems<T>(left: T[], right: T[], key: (item: T) => string) {
  return (
    JSON.stringify(left.map(key).sort()) ===
    JSON.stringify(right.map(key).sort())
  );
}
export async function draftAccess(
  tx: Tx,
  key: string,
  input: InstantInput,
  secret?: string,
  actor?: Actor,
  lock = false,
) {
  const q = tx.select().from(guestRfpDrafts).where(eq(guestRfpDrafts.id, key));
  const [d] = lock ? await q.for('update') : await q;
  if (
    !d ||
    d.deletedAt ||
    d.completedAt ||
    (d.expiresAt && +d.expiresAt <= Date.now()) ||
    (d.userId
      ? actor?.userId !== d.userId || actor?.workspaceId !== d.workspaceId
      : !secret || d.secretHash !== guestSecretHash(secret))
  )
    deny('이 초안을 작성한 브라우저 또는 구매사 계정에서 이어주세요.');
  const ctx = d.answers.quoteContext;
  if (
    ctx?.bizNo !== input.business.bizNo ||
    ctx.confirmedWebsite !== input.business.website ||
    !ctx.confirmed.includes('business-number')
  )
    deny('홈페이지와 사업자등록번호를 다시 확인해주세요.');
  const saved = d.answers.data;
  const group =
    saved.industryMode === 'custom' ? null : saved.industryGroupId || null;
  const sameVolume =
    input.contractType === 'new'
      ? saved.expectedVolume === input.expectedVolume
      : saved.monthlyAvgPgVolume === input.monthlyAvgPgVolume;
  if (
    !isValidWebsiteUrl(input.business.website) ||
    normalizeWebsiteUrl(saved.websiteUrl?.trim() ?? '') !==
      input.business.website ||
    saved.mainProducts?.trim() !== input.products ||
    group !== input.groupId ||
    (!group && saved.customIndustryName?.trim() !== input.customIndustry) ||
    saved.contractType !== input.contractType ||
    !sameVolume ||
    !!saved.customPaymentMethods?.length ||
    !!d.fileIds.length ||
    !sameItems(saved.requiredPaymentMethods ?? [], input.methods, (m) => m) ||
    (input.contractType === 'renewal' &&
      !sameItems(saved.currentPgs ?? [], input.currentPgs, (p) =>
        JSON.stringify([p.pgWorkspaceId, p.name]),
      ))
  )
    deny('저장한 초안의 사업 정보와 거래 조건을 다시 확인해주세요.');
  const [reserved] = await tx
    .select()
    .from(guestRfpRequests)
    .where(eq(guestRfpRequests.draftId, key));
  if (reserved) deny('이미 예약한 상담은 기존 신청에서 이어주세요.');
}
export async function previewTier(
  tx: Tx,
  key: string,
  input: InstantInput,
  now: Date,
): Promise<MerchantTier | null> {
  const [v] = await tx
    .select()
    .from(guestQuoteCalls)
    .where(
      and(
        eq(guestQuoteCalls.draftId, key),
        eq(guestQuoteCalls.kind, 'business'),
        gt(guestQuoteCalls.expiresAt, now),
      ),
    )
    .orderBy(desc(guestQuoteCalls.createdAt))
    .limit(1);
  const b = v?.result?.business;
  if (
    b?.bizNo !== input.business.bizNo ||
    !b.age ||
    new Date(+v.createdAt + 9 * 3600000).toISOString().slice(0, 10) !==
      new Date(+now + 9 * 3600000).toISOString().slice(0, 10)
  )
    return null;
  return b.age === 'new'
    ? 'sole'
    : input.annualRevenue === undefined
      ? null
      : provisionalTier(input.annualRevenue);
}
export async function history(tx: Tx, key: string, actor: Actor, lock = false) {
  const q = tx
    .select()
    .from(requests)
    .where(
      and(
        eq(requests.requestKey, key),
        eq(requests.buyerId, actor.workspaceId),
      ),
    );
  const [request] = lock ? await q.for('update') : await q;
  if (request && request.creator !== actor.userId)
    deny('신청을 작성한 계정에서 열어주세요.');
  const all = request
    ? await tx.select().from(attempts).where(eq(attempts.requestId, request.id))
    : [];
  return { request, all, active: all.find((a) => !a.closedAt) };
}
export async function loadInstant(tx: Tx, id: string, lock = false) {
  const q = tx
    .select({
      a: attempts,
      r: requests,
      canVisit: sql<boolean>`${attempts.validUntil} > now()`,
      canRetry: sql<boolean>`${attempts.retryUntil} > now()`,
    })
    .from(attempts)
    .innerJoin(requests, eq(requests.id, attempts.requestId))
    .where(eq(attempts.id, id));
  if (lock) {
    const [source] = await tx
      .select({ id: attempts.requestId })
      .from(attempts)
      .where(eq(attempts.id, id));
    if (!source) return undefined;
    await tx
      .select({ id: requests.id })
      .from(requests)
      .where(eq(requests.id, source.id))
      .for('update');
  }
  return (lock ? await q.for('update', { of: attempts }) : await q)[0];
}
export async function configs(tx: Tx, group: string, lock: boolean) {
  const q = tx
    .select({
      channel: channels,
      industry: pgRecommendationGroups.name,
      policy: policies,
      rates: pgAgreementRates,
      name: workspaces.name,
    })
    .from(policies)
    .innerJoin(
      pgRecommendationGroups,
      eq(pgRecommendationGroups.id, policies.groupId),
    )
    .innerJoin(channels, eq(channels.pgId, policies.pgId))
    .innerJoin(pgAgreementRates, eq(pgAgreementRates.pgWsId, policies.pgId))
    .innerJoin(workspaces, eq(workspaces.id, policies.pgId))
    .where(
      and(
        eq(policies.groupId, group),
        eq(channels.enabled, true),
        eq(workspaces.status, 'active'),
        eq(workspaces.type, 'pg'),
      ),
    );
  return lock ? await q.for('share') : await q;
}
/**
 * 접수 스위치. 켜진 채널만으로는 열지 않는다: 업종이 화이트에서 빠지거나 후보에서 빠진 PG,
 * 추천에서 제외되는 테스트 PG는 견적을 낼 수 없어 방문자에게 빈 화면만 남기기 때문이다.
 */
export async function intakeOpen(tx: Tx, pgId?: string): Promise<boolean> {
  const rows: { name: string }[] = await tx
    .selectDistinct({ name: workspaces.name })
    .from(policies)
    .innerJoin(channels, eq(channels.pgId, policies.pgId))
    .innerJoin(pgAgreementRates, eq(pgAgreementRates.pgWsId, policies.pgId))
    .innerJoin(workspaces, eq(workspaces.id, policies.pgId))
    .innerJoin(pgMatchingPolicies, eq(pgMatchingPolicies.groupId, policies.groupId))
    .where(
      and(
        eq(channels.enabled, true),
        eq(workspaces.status, 'active'),
        eq(workspaces.type, 'pg'),
        sql`${pgMatchingPolicies.policy}->>'risk' = 'white'`,
        sql`${pgMatchingPolicies.policy}->'candidates' @> jsonb_build_array(jsonb_build_object('pgWorkspaceId', ${policies.pgId}::text))`,
        pgId ? eq(policies.pgId, pgId) : undefined,
      ),
    );
  return rows.some((row) => !isTestPgName(row.name));
}
export async function lockMatching(tx: Tx, group: string) {
  await tx
    .select()
    .from(pgMatchingPolicies)
    .where(eq(pgMatchingPolicies.groupId, group))
    .for('share');
}
export async function lockDraft(tx: Tx, key: string) {
  return (
    await tx
      .select({ id: guestRfpDrafts.id })
      .from(guestRfpDrafts)
      .where(eq(guestRfpDrafts.id, key))
      .for('update')
  )[0];
}
export async function insertRequest(
  tx: Tx,
  data: typeof requests.$inferInsert,
) {
  return (await tx.insert(requests).values(data).returning())[0];
}
export async function completeDraft(
  tx: Tx,
  key: string,
  actor: Actor,
  now: Date,
) {
  await tx
    .update(guestRfpDrafts)
    .set({
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      completedAt: now,
    })
    .where(eq(guestRfpDrafts.id, key));
}
export async function insertAttempt(
  tx: Tx,
  data: typeof attempts.$inferInsert,
) {
  return (await tx.insert(attempts).values(data).returning())[0];
}
export async function updateAttempt(
  tx: Tx,
  id: string,
  patch: Partial<typeof attempts.$inferInsert>,
) {
  return (
    await tx.update(attempts).set(patch).where(eq(attempts.id, id)).returning()
  )[0];
}
export async function startSigning(tx: Tx, id: string, actor: Actor) {
  await tx.insert(signingContracts).values({
    instantAttemptId: id,
    kind: 'platform_buyer',
    createdBy: actor.userId,
  });
}

export async function instantAward(id: string, connection?: Tx) {
  const db: Tx = connection ?? (await instantDb());
  const [row] = await db
    .select({ a: attempts, r: requests })
    .from(attempts)
    .innerJoin(requests, eq(requests.id, attempts.requestId))
    .where(and(eq(attempts.id, id), isNotNull(attempts.selectedAt)));
  if (!row) return;
  const { a, r } = row;
  const request: SigningRequest = {
    id: r.id,
    code: a.code,
    title: a.terms.pgName + ' PG 가입',
    createdBy: r.creator,
    buyerWsId: r.buyerId,
    instantAttemptId: id,
  };
  return {
    request,
    terms: a.terms,
    bizNo: r.input.business.bizNo,
    consent: a.consent,
    validUntil: a.validUntil,
    input: r.input,
  };
}
