import { describe, expect, it } from 'vitest';

import { toContractArchiveEntry } from '../entry';
import type { ContractArchive } from '@/lib/types/contract-archive';

function row(o: Partial<ContractArchive> = {}): ContractArchive {
  return {
    id: 'a1',
    workspaceId: 'ws1',
    source: 'signing',
    signingContractId: 'sc1',
    rfpCode: 'P-2607-0042',
    title: '결제대행 서비스 이용계약',
    counterpartyName: 'OO페이',
    contractedAt: '2026-08-01T09:00:00.000Z',
    status: 'ready',
    documentKey: 'contract-archives/signing/sc1/document.pdf',
    documentName: '완료본.pdf',
    documentSize: 1234,
    auditKey: 'contract-archives/signing/sc1/audit.pdf',
    auditName: '인증서.pdf',
    attempts: 0,
    createdBy: 'u1',
    createdAt: '2026-08-01T09:00:01.000Z',
    ...o,
  };
}

describe('toContractArchiveEntry', () => {
  // 스토리지 키가 클라이언트로 새면 그 자체로 경계 위반은 아니지만(presigned 가
  // 없으면 못 읽는다) 내부 구조를 그대로 노출하는 것이라 매퍼가 걷어낸다.
  it('스토리지 키를 내보내지 않는다', () => {
    const e = toContractArchiveEntry(row(), 'buyer');
    expect(JSON.stringify(e)).not.toContain('contract-archives/');
    expect('documentKey' in e).toBe(false);
    expect('auditKey' in e).toBe(false);
    // workspaceId 도 뺀다 — 목록은 이미 그 워크스페이스 것만 담는다.
    expect('workspaceId' in e).toBe(false);
  });

  it('hasAudit 는 인증서 키 유무에서 파생한다', () => {
    expect(toContractArchiveEntry(row(), 'buyer').hasAudit).toBe(true);
    expect(toContractArchiveEntry(row({ auditKey: null }), 'buyer').hasAudit).toBe(false);
  });

  // 딜룸 경로가 역할별로 갈린다 — buyer 는 /rfp, PG 는 /inbox.
  it('딜룸 링크가 워크스페이스 타입별로 갈린다', () => {
    expect(toContractArchiveEntry(row(), 'buyer').dealHref).toBe('/rfp/P-2607-0042');
    expect(toContractArchiveEntry(row(), 'pg').dealHref).toBe('/inbox/P-2607-0042');
  });

  // RFP 삭제로 signing 행이 죽으면(SET NULL) 견적번호 스냅샷은 남지만 딜은 없다 —
  // 링크를 내주면 404 로 간다. 텍스트로만 보여야 한다.
  it('딜이 죽었으면(signingContractId 없음) 링크를 내지 않는다', () => {
    const e = toContractArchiveEntry(row({ signingContractId: null }), 'buyer');
    expect(e.dealHref).toBeNull();
    expect(e.rfpCode).toBe('P-2607-0042'); // 스냅샷은 살아 있다
  });

  it('수동 업로드에는 딜 링크가 없다', () => {
    const e = toContractArchiveEntry(
      row({ source: 'upload', signingContractId: null, rfpCode: null }),
      'buyer',
    );
    expect(e.dealHref).toBeNull();
  });

  // 보존 원칙 — 자동 보관본은 삭제 불가. 서버가 SSOT 이고 UI 는 버튼을 숨긴다.
  it('canDelete 는 수동 업로드만 참이다', () => {
    expect(toContractArchiveEntry(row({ source: 'upload' }), 'buyer').canDelete).toBe(true);
    expect(toContractArchiveEntry(row({ source: 'signing' }), 'buyer').canDelete).toBe(false);
  });
});
