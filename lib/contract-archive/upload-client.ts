/**
 * 계약 보관함 수동 업로드 adapter. presign→PUT→complete 순서는
 * `lib/presigned-upload/client`가 소유한다.
 *
 * 첨부와 다른 점: 메타(제목·상대방·체결일)를 **presign 단계에서 함께** 보낸다.
 * pending 행부터 `title NOT NULL` 이 성립해야 하기 때문이다(버려진 pending 도
 * 사람이 읽을 수 있는 상태로 남는다).
 */
import { runPresignedUpload } from '@/lib/presigned-upload/client';

export type ArchiveUploadMeta = {
  title: string;
  counterpartyName?: string;
  /** `YYYY-MM-DD`. */
  contractedAt?: string;
};

export async function uploadContractArchive(
  file: File,
  meta: ArchiveUploadMeta,
): Promise<{ id: string }> {
  return runPresignedUpload({
    file,
    contentType: 'application/pdf',
    async presign() {
      const response = await fetch('/api/contract-archives/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          title: meta.title,
          ...(meta.counterpartyName ? { counterpartyName: meta.counterpartyName } : {}),
          ...(meta.contractedAt ? { contractedAt: meta.contractedAt } : {}),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `PRESIGN_FAILED_${response.status}`);
      }
      return (await response.json()) as { id: string; uploadUrl: string };
    },
    async complete(id) {
      const response = await fetch(`/api/contract-archives/${id}/complete`, { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `COMPLETE_FAILED_${response.status}`);
      }
      return (await response.json()) as { id: string };
    },
  });
}
