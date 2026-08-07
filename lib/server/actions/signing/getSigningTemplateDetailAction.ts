'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import type { ActionResult } from '@/lib/server/actions/_result';
import type { SigningTemplateFieldInput } from '@/lib/types/signing';

const Input = z.object({ templateId: z.string().min(1) }).strict();

/**
 * 수정 진입용 상세 — 이름(로컬 행) + provider 에서 되읽은 서명칸(에디터 입력 형태).
 * role_name→party 매핑은 서비스가 끝내므로 클라이언트는 provider 표기를 모른다.
 */
export async function getSigningTemplateDetailAction(
  input: z.input<typeof Input>,
): Promise<ActionResult<{ name: string; fields: SigningTemplateFieldInput[] }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getSigningTemplateService();
  return service.getDetail(
    { userId: actor.userId, workspaceId: actor.workspaceId },
    parsed.data.templateId,
  );
}
