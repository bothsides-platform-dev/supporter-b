'use server';

/**
 * 계약 보관함 서버 액션 — 얇은 진입점(세션 검증 + 입력 파싱 후 서비스에 위임).
 *
 * `requireActiveWorkspace` 를 쓰는 이유: 보관함은 구매사·PG **양쪽**이 각자 갖는
 * 표면이다(견적 템플릿의 `requirePgWorkspace` 와 갈리는 지점). 그 헬퍼가 PG 멤버십
 * 승인 게이트를 이미 품고 있다.
 *
 * 도메인 판정(행 소유 ACL, `source='upload'` 만 삭제 가능이라는 **보존 원칙**)은
 * 전부 서비스가 소유한다 — 여기서 다시 판정하면 판정이 둘이 되어 갈릴 수 있다.
 */
import { z } from 'zod';

import { requireActiveWorkspace } from '@/lib/server/actions/_session';
import { getContractArchiveService } from '@/lib/server/services/contract-archive';
import type { ActionResult } from '@/lib/server/actions/_result';
import type { ContractArchive } from '@/lib/types/contract-archive';

export async function listContractArchivesAction(): Promise<
  ActionResult<{ rows: ContractArchive[] }>
> {
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;
  return (await getContractArchiveService()).listForWorkspace({
    userId: ws.userId,
    workspaceId: ws.workspaceId,
  });
}

const DeleteInput = z.object({ id: z.string().uuid() }).strict();

export async function deleteContractArchiveAction(
  input: z.infer<typeof DeleteInput>,
): Promise<ActionResult> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  return (await getContractArchiveService()).deleteUpload(parsed.data.id, {
    userId: ws.userId,
    workspaceId: ws.workspaceId,
  });
}
