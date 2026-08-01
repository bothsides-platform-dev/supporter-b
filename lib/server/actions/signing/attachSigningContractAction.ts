'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import type { ActionResult } from '@/lib/server/actions/_result';

// providerContractId 는 브라우저(임베드 postMessage)에서 온 값이다 — 경로 세그먼트로
// 쓰이므로 `lib/signing/embed-events.ts` 와 같은 화이트리스트를 서버에서도 강제한다.
// 진짜 소유·상태 게이트는 서비스의 재조회 검증이다.
const Input = z
  .object({
    rfpCode: z.string().min(1),
    providerContractId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  })
  .strict();

/**
 * 딜룸 계약 탭 — 임베드가 만든 스노우싸인 계약을 우리 계약 행에 바인딩한다.
 * 성공 시 `participantMismatch` 가 실려 오면 구매사 담당자가 수신자에 없다는 뜻이다.
 */
export async function attachSigningContractAction(
  input: { rfpCode: string; providerContractId: string },
): Promise<ActionResult<{ participantMismatch?: boolean }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const rfp = await (await getRfpRepo()).findByCode(parsed.data.rfpCode);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  const service = await getContractSigningService();
  return service.attachProviderContract(rfp.id, parsed.data.providerContractId, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
}
