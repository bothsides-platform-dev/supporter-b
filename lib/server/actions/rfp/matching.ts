'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireBuyerActor, requirePgActor } from '../_session';
import { getPgMatchingRepo, getWorkspaceRepo, getRfpRepo } from '@/lib/server/repositories/factory';
import { getPgMatchingService } from '@/lib/server/services/pg-matching';
import { SHOW_TEST_PG_COOKIE, showTestPgFromCookie } from '@/lib/features/test-pg';

export async function matchingBusinessAction() {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;
  const ws = await (await getWorkspaceRepo()).findById(actor.workspaceId);
  return { ok: true as const, hasBusinessProfile: !!ws?.bizProfile?.bizNo };
}

export async function recommendPgAction(industryGroupId: string) {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;
  if (!z.string().uuid().safeParse(industryGroupId).success) return { ok: false as const, error: 'MATCHING_REQUIRED' };
  const includeTest = showTestPgFromCookie((await cookies()).get(SHOW_TEST_PG_COOKIE)?.value);
  return { ok: true as const, recommendation: await (await getPgMatchingRepo()).recommendation(industryGroupId, [], undefined, includeTest) };
}

const Review = z.object({ rfpId: z.string().uuid(), reviewId: z.string().uuid(), status: z.enum(['reviewing', 'rejected']), reason: z.string().trim().max(500) }).strict();
export async function reviewPgRequestAction(input: z.input<typeof Review>) {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Review.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'INVALID_INPUT' };
  const { rfpId, reviewId, status, reason } = parsed.data;
  const result = await (await getPgMatchingService()).review(rfpId, reviewId, status, reason, actor);
  if (result.ok) await refreshRequest(rfpId);
  return result;
}

const Next = z.object({ rfpId: z.string().uuid(), previousReviewId: z.string().uuid(), pgWorkspaceId: z.string().uuid(), deadline: z.string().datetime({ offset: true }) }).strict();
export async function requestNextPgAction(input: z.input<typeof Next>) {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;
  const parsed = Next.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'INVALID_INPUT' };
  const { rfpId, previousReviewId, pgWorkspaceId, deadline } = parsed.data;
  const includeTest = showTestPgFromCookie((await cookies()).get(SHOW_TEST_PG_COOKIE)?.value);
  const result = await (await getPgMatchingService()).next(rfpId, previousReviewId, pgWorkspaceId, new Date(deadline), actor, includeTest);
  if (result.ok) await refreshRequest(rfpId);
  return result;
}

async function refreshRequest(rfpId: string) {
  const rfp = await (await getRfpRepo()).findById(rfpId);
  if (rfp) { revalidatePath(`/rfp/${rfp.code}`); revalidatePath(`/inbox/${rfp.code}`); }
}
