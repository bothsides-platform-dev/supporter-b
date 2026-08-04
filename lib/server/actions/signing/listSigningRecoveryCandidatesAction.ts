'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import type { ActionResult } from '@/lib/server/actions/_result';
import type { SigningRecoveryCandidate } from '@/lib/types/signing';

const Input = z
  .object({ rfpCode: z.string().min(1) })
  .strict();

/**
 * 딜룸 계약 탭 — "보낸 계약서 찾기". 완료 postMessage 가 유실돼 대기에 갇힌 계약의
 * 후보를 찾아 PG 에게 보여준다.
 *
 * **채택하지 않는다.** 고른 뒤 연결하는 건 `attachSigningContractAction` 이고, 고르는
 * 건 사람이다 — 상관키(참여자 이메일)는 휴리스틱이라 기계가 틀리면 남의 계약이 이
 * 딜룸에 붙는다.
 *
 * ACL(낙찰 PG 인지)·상태(awaiting 인지)·동시성(리스)·호출 예산은 서비스가 소유한다.
 * `truncated` 면 화면이 "최근 것부터 확인했어요" 안내와 다시 확인 버튼을 띄운다.
 */
export async function listSigningRecoveryCandidatesAction(
  input: { rfpCode: string },
): Promise<ActionResult<{ candidates: SigningRecoveryCandidate[]; truncated: boolean }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const rfp = await (await getRfpRepo()).findByCode(parsed.data.rfpCode);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  const service = await getContractSigningService();
  return service.listRecoveryCandidates(
    rfp.id,
    { userId: actor.userId, workspaceId: actor.workspaceId },
    // 동료가 쥐고 있어 막혔을 때만 화면이 다시 부른다(사용자가 확인한 뒤). 기본은
    // undefined 라 스캔이 조용히 남의 리스를 뺏는 일이 없다.
  );
}
