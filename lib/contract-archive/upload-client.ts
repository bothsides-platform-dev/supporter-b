/**
 * 계약 보관함 수동 업로드 클라이언트 — 2-phase presign(`lib/attachments/upload-client`
 * 미러).
 *
 * 첨부와 다른 점: 메타(제목·상대방·체결일)를 **presign 단계에서 함께** 보낸다.
 * pending 행부터 `title NOT NULL` 이 성립해야 하기 때문이다(버려진 pending 도
 * 사람이 읽을 수 있는 상태로 남는다).
 */
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
  const presignRes = await fetch('/api/contract-archives/presign', {
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
  if (!presignRes.ok) {
    // 서버가 준 코드를 그대로 올린다 — 화면이 상한 초과(캡)와 일반 실패를 갈라
    // 다른 문구를 낼 수 있어야 한다.
    const body = (await presignRes.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `PRESIGN_FAILED_${presignRes.status}`);
  }
  const { id, uploadUrl } = (await presignRes.json()) as { id: string; uploadUrl: string };

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': 'application/pdf' },
  });
  if (!putRes.ok) throw new Error('UPLOAD_TRANSFER_FAILED');

  const completeRes = await fetch(`/api/contract-archives/${id}/complete`, { method: 'POST' });
  if (!completeRes.ok) {
    const body = (await completeRes.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `COMPLETE_FAILED_${completeRes.status}`);
  }
  return (await completeRes.json()) as { id: string };
}
