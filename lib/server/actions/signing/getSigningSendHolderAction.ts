'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ rfpCode: z.string().min(1) }).strict();

/**
 * 발송 리스를 쥔 동료의 이름 — 이어받기 확인 다이얼로그가 "누구의 작성을 뺏는지"
 * 말하기 위해 부른다.
 *
 * **실패 결과에 얹지 않고 별도 액션으로 둔 이유**: `ActionResult` 는
 * `({ok:true} & T) | {ok:false; error:string}` 이라 실패 분기에 필드를 더하면 union
 * excess-property 로 컴파일이 깨진다. 그걸 피하려고 레포 전역이 쓰는 타입을 이 기능
 * 하나 때문에 넓힐 이유가 없고, 60초마다 도는 하트비트의 실패 경로에 로스터 조회를
 * 얹을 이유도 없다.
 *
 * 이름이 없으면(`holder: null`) 화면이 '다른 담당자'로 적는다. 이름만 돌려준다.
 */
export async function getSigningSendHolderAction(input: {
  rfpCode: string;
}): Promise<ActionResult<{ holder: { userId: string; name: string } | null }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const rfp = await (await getRfpRepo()).findByCode(parsed.data.rfpCode);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  const service = await getContractSigningService();
  return service.getSendLeaseHolder(rfp.id, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
}
