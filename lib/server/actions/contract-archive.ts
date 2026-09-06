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
import { toContractArchiveEntry } from '@/lib/contract-archive/entry';
import type { ActionResult } from '@/lib/server/actions/_result';
import type { ContractArchiveEntry } from '@/lib/types/contract-archive';

/**
 * ⚠️ **매퍼가 경계다 — 호출자가 아니다.** 이 함수는 `'use server'` 액션이라 클라이언트
 * 액션 매니페스트에 등록되고, 인증된 사용자는 RPC 로 직접 부를 수 있다. 그러니 raw
 * `ContractArchive` 를 돌려주면 `documentKey`·`auditKey`·`workspaceId`·`createdBy` 가
 * 페이지의 매핑 여부와 무관하게 나간다 — 타입 주석이 "클라이언트로 내보내지 않는다"고
 * 적어 둔 바로 그 필드들이다. 여기서 `toContractArchiveEntry` 를 통과시켜야 그 문장이
 * 페이지의 호의가 아니라 강제가 된다.
 */
export async function listContractArchivesAction(): Promise<
  ActionResult<{ rows: ContractArchiveEntry[] }>
> {
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;
  const r = await (await getContractArchiveService()).listForWorkspace({
    userId: ws.userId,
    workspaceId: ws.workspaceId,
  });
  if (!r.ok) return r;
  const workspaceType = ws.workspaceType === 'pg' ? 'pg' : 'buyer';
  return { ok: true, rows: r.rows.map((row) => toContractArchiveEntry(row, workspaceType)) };
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
