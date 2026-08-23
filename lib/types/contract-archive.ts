export type ContractArchiveSource = 'signing' | 'upload';
export type ContractArchiveStatus = 'pending' | 'ready' | 'failed';

/** 서버 내부용 전체 행. documentKey/auditKey 는 클라이언트로 내보내지 않는다. */
export type ContractArchive = {
  id: string;
  workspaceId: string;
  source: ContractArchiveSource;
  signingContractId: string | null;
  rfpCode: string | null;
  title: string;
  counterpartyName: string | null;
  contractedAt: string | null; // ISO
  status: ContractArchiveStatus;
  documentKey: string | null;
  documentName: string | null;
  documentSize: number | null;
  auditKey: string | null;
  auditName: string | null;
  attempts: number;
  createdBy: string | null;
  createdAt: string; // ISO
};

/** 클라이언트 전달용 — 스토리지 키 제외, 파생 필드 포함. */
export type ContractArchiveEntry = {
  id: string;
  source: ContractArchiveSource;
  status: ContractArchiveStatus;
  title: string;
  counterpartyName: string | null;
  rfpCode: string | null;
  contractedAt: string | null;
  documentName: string | null;
  hasAudit: boolean;
  /** 딜룸 링크(살아있는 딜만). buyer=/rfp/<code>, pg=/inbox/<code>. */
  dealHref: string | null;
  canDelete: boolean;
  createdAt: string;
};
