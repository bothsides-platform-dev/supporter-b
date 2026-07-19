'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ snowsignTemplateId: z.string().min(1) }).strict();

/**
 * PG — SnowSign 템플릿 detail(역할명·변수명)을 매핑 UI 용으로 조회한다. 임베드로
 * 계약서를 등록한 직후 이 PG 가 링크하려는 템플릿의 필드를 자동 채우는 데 쓴다.
 */
export async function getSigningTemplateDetailAction(input: {
  snowsignTemplateId: string;
}): Promise<
  ActionResult<{
    name: string;
    roleNames: string[];
    variables: { name: string; label?: string; required: boolean }[];
  }>
> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const service = await getContractSigningService();
  return service.getTemplateDetail(
    { userId: actor.userId, workspaceId: actor.workspaceId },
    parsed.data.snowsignTemplateId,
  );
}
