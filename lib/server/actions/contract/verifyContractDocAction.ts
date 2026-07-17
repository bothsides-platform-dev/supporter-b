'use server';

import { z } from 'zod';

import { requireActiveWorkspace } from '@/lib/server/actions/_session';
import { getContractService } from '@/lib/server/services/contract';
import type { ContractActionResult } from './_shared';

const Input = z.object({ docId: z.string().uuid() }).strict();

export type VerifyContractDocInput = z.input<typeof Input>;
export type VerifyContractDocResult = ContractActionResult<{ intact: boolean; computed: string }>;

/**
 * 문서 무결성 검증 배지 — base(또는 완료본) PDF의 SHA-256을 재계산해 저장된 해시와
 * 비교. 양측 워크스페이스 아무나(requireActiveWorkspace) 호출 가능.
 */
export async function verifyContractDocAction(input: VerifyContractDocInput): Promise<VerifyContractDocResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const service = await getContractService();
  return service.verify(parsed.data.docId, { userId: ws.userId, workspaceId: ws.workspaceId });
}
