'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import { CONTRACT_ID_RE } from '@/lib/signing/embed-events';
import type { ActionResult } from '@/lib/server/actions/_result';

// providerContractId 는 브라우저(임베드 postMessage)에서 온 값이다 — 경로 세그먼트로
// 쓰이므로 클라이언트가 쓰는 것과 **같은 화이트리스트 상수**를 서버에서도 강제한다
// (복제하지 않는다). 진짜 소유·상태 게이트는 서비스의 재조회 검증이다.
const Input = z
  .object({
    rfpCode: z.string().min(1),
    providerContractId: z.string().regex(CONTRACT_ID_RE),
    /**
     * 사용자가 보고 있던 계약 행. 복구 다이얼로그 전용 — 그 사이 resend 가 새 라운드를
     * 열었으면 서비스가 CONTRACT_CHANGED 로 막는다. 임베드는 그 자리에서 끝나 안 넘긴다.
     */
    expectedContractId: z.uuid().optional(),
    source: z.enum(['embed', 'recovery']).optional(),
  })
  .strict();

/**
 * 딜룸 계약 탭 — 임베드가 만든 스노우싸인 계약을 우리 계약 행에 바인딩한다.
 * 성공 시 `participantMismatch` 가 실려 오면 구매사 담당자가 수신자에 없다는 뜻이다.
 */
export async function attachSigningContractAction(
  input: {
    rfpCode: string;
    providerContractId: string;
    expectedContractId?: string;
    source?: 'embed' | 'recovery';
  },
): Promise<ActionResult<{ participantMismatch?: boolean }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const rfp = await (await getRfpRepo()).findByCode(parsed.data.rfpCode);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  const service = await getContractSigningService();
  return service.attachProviderContract(
    rfp.id,
    parsed.data.providerContractId,
    { userId: actor.userId, workspaceId: actor.workspaceId },
    { expectedContractId: parsed.data.expectedContractId, source: parsed.data.source ?? 'embed' },
  );
}
