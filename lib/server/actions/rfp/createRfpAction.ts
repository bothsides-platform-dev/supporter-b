'use server';

import { cookies } from 'next/headers';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import { getRfpService } from '@/lib/server/services/rfp';
import { logBusinessEvent } from '@/lib/observability/log';
import type { RfpActionResult } from './_shared';
import { SHOW_TEST_PG_COOKIE, showTestPgFromCookie } from '@/lib/features/test-pg';
import { parseCreateRfpInput } from '@/lib/rfp/intake/parse';
import type { CreateRfpInput } from '@/lib/rfp/intake/schema';

export type { CreateRfpInput };
export type CreateRfpResult = RfpActionResult<{ rfpId: string }>;

// 입력의 모양·검증·거부 사유는 `lib/rfp/intake` 가 소유한다. 액션은 세션과
// 테스트 PG 쿠키만 보탠 뒤 검증된 입력을 그대로 서비스에 넘긴다.
export async function createRfpAction(
  input: CreateRfpInput,
  expectedActor?: { userId: string; workspaceId: string },
): Promise<CreateRfpResult> {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;
  if (expectedActor && (actor.userId !== expectedActor.userId || actor.workspaceId !== expectedActor.workspaceId)) return { ok: false, error: 'WORKSPACE_CHANGED' };

  const parsed = parseCreateRfpInput(input);
  if (!parsed.ok) return parsed;

  const service = await getRfpService();
  const includeTestPg = parsed.data.send && showTestPgFromCookie((await cookies()).get(SHOW_TEST_PG_COOKIE)?.value);
  const result = await service.createRfp(
    parsed.data,
    { userId: actor.userId, workspaceId: actor.workspaceId },
    includeTestPg,
  );

  if (result.ok && parsed.data.send) {
    logBusinessEvent('rfp.sent', {
      rfpId: result.rfpId,
      inviteCount: parsed.data.allowedPgWorkspaceIds.length,
    });
  }

  return result;
}
