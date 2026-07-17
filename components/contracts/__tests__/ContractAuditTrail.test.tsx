import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ContractAuditTrail } from '../ContractAuditTrail';
import type { ContractDocEvent, ContractDocSigner } from '@/lib/types/contract-doc';

afterEach(cleanup);

const signers: ContractDocSigner[] = [
  {
    id: 's1',
    docId: 'd1',
    party: 'buyer',
    userId: 'u1',
    name: '김구매',
    email: 'buyer@x.com',
    consentAt: null,
    consentTextVersion: null,
    signedAt: null,
    signatureMethod: null,
    signIp: null,
    signUserAgent: null,
    reassignedBy: null,
    reassignedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('ContractAuditTrail', () => {
  it('이벤트 타입 라벨 + 행위자명 + IP 를 렌더한다', () => {
    const events: ContractDocEvent[] = [
      {
        id: 'e1',
        docId: 'd1',
        type: 'sent',
        actorUserId: 'u1',
        actorParty: 'pg',
        ip: '1.2.3.4',
        userAgent: null,
        metadata: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    render(<ContractAuditTrail events={events} signers={signers} />);
    expect(screen.getByText('계약서 발송')).toBeInTheDocument();
    expect(screen.getByText('김구매')).toBeInTheDocument();
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument();
  });

  it('actorUserId 가 signers 에 없으면(시스템 이벤트) 행위자명을 렌더하지 않는다', () => {
    const events: ContractDocEvent[] = [
      {
        id: 'e2',
        docId: 'd1',
        type: 'expired',
        actorUserId: null,
        actorParty: null,
        ip: null,
        userAgent: null,
        metadata: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    render(<ContractAuditTrail events={events} signers={signers} />);
    expect(screen.getByText('기한 만료')).toBeInTheDocument();
    expect(screen.queryByText('김구매')).not.toBeInTheDocument();
  });

  it('여러 이벤트를 발생 순서대로 모두 렌더한다', () => {
    const events: ContractDocEvent[] = [
      {
        id: 'e1',
        docId: 'd1',
        type: 'sent',
        actorUserId: 'u1',
        actorParty: 'pg',
        ip: '1.2.3.4',
        userAgent: null,
        metadata: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'e2',
        docId: 'd1',
        type: 'viewed',
        actorUserId: 'u1',
        actorParty: 'buyer',
        ip: '5.6.7.8',
        userAgent: null,
        metadata: null,
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ];
    render(<ContractAuditTrail events={events} signers={signers} />);
    expect(screen.getByText('계약서 발송')).toBeInTheDocument();
    expect(screen.getByText('계약서 열람')).toBeInTheDocument();
  });
});
