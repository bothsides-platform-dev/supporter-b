'use server';

import { z } from 'zod';

import { requireActiveWorkspace } from '@/lib/server/actions/_session';
import { getContractService } from '@/lib/server/services/contract';
import { getRequestMeta } from './_request-meta';
import type { ContractActionResult } from './_shared';

const Input = z.object({ docId: z.string().uuid() }).strict();

export type RecordContractViewInput = z.input<typeof Input>;
export type RecordContractViewResult = ContractActionResult;

/**
 * 계약서 열람 이벤트 기록 — best-effort, 비차단. 서비스가 정상 반환(ok:true/false)
 * 하면 그대로 패스스루하되, 예기치 못하게 throw 하면 뷰어 경험을 막지 않도록
 * 조용히 ok:true 로 흡수한다(절대 throw 하지 않는다).
 */
export async function recordContractViewAction(
  input: RecordContractViewInput,
): Promise<RecordContractViewResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const meta = await getRequestMeta();
  try {
    const service = await getContractService();
    return await service.recordView(parsed.data.docId, { userId: ws.userId, workspaceId: ws.workspaceId }, meta);
  } catch {
    return { ok: true };
  }
}
