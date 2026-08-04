'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({
    filename: z.string().min(1),
    contentType: z.literal('application/pdf'),
    sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  })
  .strict();

/**
 * 계약서 템플릿 PDF 업로드용 presigned 세션 발급.
 *
 * 원시 `uploadId` 대신 **워크스페이스에 서명 바인딩된 토큰**을 돌려준다 — 업로드
 * 세션은 조직(API 키) 공유라 원시 id 를 클라이언트에서 되받아 믿으면 남의 업로드로
 * 자기 템플릿을 만드는 경로가 열린다(`lib/server/signing/upload-token.ts`).
 */
export async function createSigningTemplateUploadSessionAction(
  input: z.input<typeof Input>,
): Promise<ActionResult<{ uploadToken: string; uploadUrl: string; fields: Record<string, string> }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getSigningTemplateService();
  return service.createUploadSession(
    { userId: actor.userId, workspaceId: actor.workspaceId },
    parsed.data,
  );
}
