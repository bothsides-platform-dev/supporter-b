import type { ContractArchive, ContractArchiveEntry } from '@/lib/types/contract-archive';

/**
 * 보관함 행 → 클라이언트 전달용 엔트리.
 *
 * 두 가지를 여기서 한다:
 * ① **스토리지 키를 걷어낸다.** presigned 없이는 못 읽지만 내부 구조를 그대로
 *    페이로드에 실을 이유가 없다. 다운로드는 `/api/contract-archives/{id}/download`
 *    가 매 요청 ACL 을 재검증해 발급한다.
 * ② **역할별 딜룸 경로를 파생한다.** buyer 는 `/rfp`, PG 는 `/inbox` 다.
 *
 * `dealHref` 가 `signingContractId` 를 조건으로 다는 이유: RFP 삭제 CASCADE 로
 * signing 행이 죽으면(FK SET NULL) 견적번호 **스냅샷은 남지만 딜은 없다**. 그때
 * 링크를 내주면 404 로 간다 — 스냅샷은 텍스트로만 보여야 한다.
 */
export function toContractArchiveEntry(
  row: ContractArchive,
  workspaceType: 'buyer' | 'pg',
): ContractArchiveEntry {
  const dealHref =
    row.signingContractId && row.rfpCode
      ? `${workspaceType === 'pg' ? '/inbox' : '/rfp'}/${row.rfpCode}`
      : null;
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    title: row.title,
    counterpartyName: row.counterpartyName,
    rfpCode: row.rfpCode,
    contractedAt: row.contractedAt,
    documentName: row.documentName,
    hasAudit: row.auditKey !== null,
    dealHref,
    // 보존 원칙 — 자동 보관본은 삭제할 수 없다. 서버(`deleteUpload`)가 SSOT 이고
    // 이 플래그는 UI 가 버튼을 숨기기 위한 파생일 뿐이다.
    canDelete: row.source === 'upload',
    createdAt: row.createdAt,
  };
}
