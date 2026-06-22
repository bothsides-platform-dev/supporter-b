'use server';

import { requireBuyerSession } from '@/lib/auth/session';
import { getAttachmentRepo } from '@/lib/server/repositories/factory';

/**
 * draft localStorage에 저장된 첨부파일 ID 중 DB에 여전히 존재하는(unclaimed) 것만 반환.
 * 24h 고아 sweep 이후 사라진 파일 ID를 클라이언트가 정리하는 데 사용.
 */
export async function verifyDraftFilesAction(ids: string[]): Promise<{ validIds: string[] }> {
  try {
    await requireBuyerSession();
  } catch {
    return { validIds: [] };
  }
  if (ids.length === 0) return { validIds: [] };

  const repo = await getAttachmentRepo();
  const rows = await repo.findUnclaimedByIds(ids);
  return { validIds: rows.map((r) => r.id) };
}
