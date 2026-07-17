import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ContractDoc, ContractDocEvent, ContractDocSigner } from '@/lib/types/contract-doc';
import type { ContractDocViewProps } from '../ContractDocView';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

// IntegrityBadge / SignDialog는 각자 테스트가 커버 — 여기선 얇게 목.
vi.mock('../IntegrityBadge', () => ({
  IntegrityBadge: () => <div data-testid="integrity-badge" />,
}));
vi.mock('../SignDialog', () => ({
  SignDialog: ({
    open,
    onSubmit,
  }: {
    open: boolean;
    onSubmit: (p: { imageDataUrl: string; method: 'draw' | 'type' }) => void;
  }) =>
    open ? (
      <button onClick={() => onSubmit({ imageDataUrl: 'data:image/png;base64,X', method: 'draw' })}>
        SIGN_SUBMIT
      </button>
    ) : null,
}));

const signMock = vi.fn();
const declineMock = vi.fn();
const cancelMock = vi.fn();
const reassignMock = vi.fn();
const recordViewMock = vi.fn();
vi.mock('@/lib/server/actions/contract', () => ({
  signContractAction: (i: unknown) => signMock(i),
  declineContractAction: (i: unknown) => declineMock(i),
  cancelContractAction: (i: unknown) => cancelMock(i),
  reassignContractSignerAction: (i: unknown) => reassignMock(i),
  recordContractViewAction: (i: unknown) => recordViewMock(i),
}));

import { ContractDocView } from '../ContractDocView';

const baseDoc: ContractDoc = {
  id: 'doc-1',
  code: 'CT-2605-0001',
  rfpId: 'rfp-1',
  bidId: 'bid-1',
  buyerWsId: 'ws-buyer',
  pgWsId: 'ws-pg',
  templateId: 'tmpl-1',
  status: 'sent',
  title: '결제대행 계약',
  parties: {
    _v: 1,
    buyer: { name: '구매사', repName: '김대표', bizNo: null },
    pg: { name: 'PG사', repName: '이대표', bizNo: null },
  },
  termsSnapshot: {
    _v: 1,
    rfpCode: 'P-2605-0042',
    rfpTitle: 'RFP',
    settleCycle: 'D+1',
    settleLimit: 0,
    guaranteeInsurance: 0,
    paymentFees: {},
    customFees: {},
    customPaymentMethods: [],
    buyerTier: null,
  },
  basePdfKey: 'k',
  basePdfSha256: 'h',
  basePdfSize: 1,
  finalPdfKey: null,
  finalPdfSha256: null,
  finalPdfSize: null,
  declineReason: null,
  createdBy: 'u-pg',
  sentAt: '2026-05-01T00:00:00.000Z',
  expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  completedAt: null,
  declinedAt: null,
  canceledAt: null,
  updatedAt: '2026-05-01T00:00:00.000Z',
};

const buyerSigner: ContractDocSigner = {
  id: 'sg-buyer',
  docId: 'doc-1',
  party: 'buyer',
  userId: 'u-buyer',
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
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};
const pgSigner: ContractDocSigner = {
  ...buyerSigner,
  id: 'sg-pg',
  party: 'pg',
  userId: 'u-pg',
  name: '이피지',
  email: 'pg@x.com',
};

const baseEvents: ContractDocEvent[] = [
  {
    id: 'e1',
    docId: 'doc-1',
    type: 'sent',
    actorUserId: 'u-pg',
    actorParty: 'pg',
    ip: '1.2.3.4',
    userAgent: null,
    metadata: null,
    createdAt: '2026-05-01T00:00:00.000Z',
  },
];

function buildProps(over?: Partial<ContractDocViewProps>): ContractDocViewProps {
  return {
    doc: baseDoc,
    signers: [buyerSigner, pgSigner],
    events: baseEvents,
    myParty: 'buyer',
    mySigner: buyerSigner,
    canSign: false,
    canDecline: false,
    canCancel: false,
    canReassign: false,
    ...over,
  };
}

beforeEach(() => {
  refresh.mockClear();
  toastMock.mockClear();
  signMock.mockReset().mockResolvedValue({ ok: true, completed: false });
  declineMock.mockReset().mockResolvedValue({ ok: true });
  cancelMock.mockReset().mockResolvedValue({ ok: true });
  reassignMock.mockReset().mockResolvedValue({ ok: true });
  recordViewMock.mockReset().mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe('ContractDocView — 헤더/본문', () => {
  it('code·title·상태칩을 렌더한다', () => {
    const { container } = render(<ContractDocView {...buildProps()} />);
    expect(screen.getByText('CT-2605-0001')).toBeInTheDocument();
    expect(screen.getByText('결제대행 계약')).toBeInTheDocument();
    // 기본 fixture 는 mySigner(buyer)=signedAt:null → "내가" 서명 대기 상태.
    // (서명자 패널의 동일 문구와 구분하기 위해 header 안에서만 조회한다.)
    const header = container.querySelector('header')!;
    expect(within(header).getByText('서명 대기')).toBeInTheDocument();
  });

  it('completed 문서만 IntegrityBadge 를 렌더한다', () => {
    const { rerender } = render(<ContractDocView {...buildProps()} />);
    expect(screen.queryByTestId('integrity-badge')).not.toBeInTheDocument();

    rerender(
      <ContractDocView
        {...buildProps({ doc: { ...baseDoc, status: 'completed' } })}
      />,
    );
    expect(screen.getByTestId('integrity-badge')).toBeInTheDocument();
  });

  it('sent 문서는 만료 D-N 을 표시하고, completed 문서는 표시하지 않는다', () => {
    const { rerender } = render(<ContractDocView {...buildProps()} />);
    expect(screen.getByText(/만료 D-\d+/)).toBeInTheDocument();

    rerender(<ContractDocView {...buildProps({ doc: { ...baseDoc, status: 'completed' } })} />);
    expect(screen.queryByText(/만료 D-\d+/)).not.toBeInTheDocument();
  });

  it('iframe 이 /api/contract-docs/{id}/file 을 가리키고, 새 창/다운로드 링크를 제공한다', () => {
    render(<ContractDocView {...buildProps()} />);
    const iframe = document.querySelector('iframe')!;
    expect(iframe).toHaveAttribute('src', '/api/contract-docs/doc-1/file');
    expect(screen.getByRole('link', { name: /새 창 열기/ })).toHaveAttribute(
      'href',
      '/api/contract-docs/doc-1/file',
    );
    expect(screen.getByRole('link', { name: '다운로드' })).toHaveAttribute(
      'href',
      '/api/contract-docs/doc-1/file?download=1',
    );
  });

  it('양측 서명자를 갑/을 라벨과 함께 렌더한다', () => {
    render(<ContractDocView {...buildProps()} />);
    expect(screen.getByText(/갑 \(구매사\)/)).toBeInTheDocument();
    expect(screen.getByText('김구매')).toBeInTheDocument();
    expect(screen.getByText(/을 \(결제대행사\)/)).toBeInTheDocument();
    // "이피지"는 서명자 패널(1) + 감사추적의 발송 이벤트 행위자(1)로 2번 렌더된다.
    expect(screen.getAllByText('이피지')).toHaveLength(2);
  });

  it('감사 추적 섹션에 이벤트 라벨을 렌더한다', () => {
    render(<ContractDocView {...buildProps()} />);
    expect(screen.getByText('계약서 발송')).toBeInTheDocument();
  });

  it('마운트 시 recordContractViewAction({docId})을 1회 호출한다', async () => {
    render(<ContractDocView {...buildProps()} />);
    await waitFor(() => expect(recordViewMock).toHaveBeenCalledWith({ docId: 'doc-1' }));
    expect(recordViewMock).toHaveBeenCalledTimes(1);
  });
});

describe('ContractDocView — CTA 게이팅', () => {
  it('네 권한이 모두 false 면 CTA 버튼이 하나도 없다', () => {
    render(<ContractDocView {...buildProps()} />);
    expect(screen.queryByRole('button', { name: '서명하기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '반려' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '회수' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '서명자 변경' })).not.toBeInTheDocument();
  });

  it('canSign 이면 "서명하기" 버튼이 보인다', () => {
    render(<ContractDocView {...buildProps({ canSign: true })} />);
    expect(screen.getByRole('button', { name: '서명하기' })).toBeInTheDocument();
  });
});

describe('ContractDocView — 서명 플로우', () => {
  it('서명하기 → SignDialog 제출 → signContractAction 호출 후 router.refresh', async () => {
    const user = userEvent.setup();
    render(<ContractDocView {...buildProps({ canSign: true })} />);
    await user.click(screen.getByRole('button', { name: '서명하기' }));
    await user.click(screen.getByText('SIGN_SUBMIT'));
    await waitFor(() =>
      expect(signMock).toHaveBeenCalledWith({
        docId: 'doc-1',
        imageDataUrl: 'data:image/png;base64,X',
        method: 'draw',
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('서명 실패 시 refresh 하지 않고 에러 토스트를 띄운다', async () => {
    signMock.mockResolvedValueOnce({ ok: false, error: 'ALREADY_SIGNED' });
    const user = userEvent.setup();
    render(<ContractDocView {...buildProps({ canSign: true })} />);
    await user.click(screen.getByRole('button', { name: '서명하기' }));
    await user.click(screen.getByText('SIGN_SUBMIT'));
    await waitFor(() => expect(signMock).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalled();
  });
});

describe('ContractDocView — 반려 플로우', () => {
  it('canDecline 이면 반려 버튼 → 사유 입력 → declineContractAction 호출', async () => {
    const user = userEvent.setup();
    render(<ContractDocView {...buildProps({ canDecline: true })} />);
    await user.click(screen.getByRole('button', { name: '반려' }));
    const textarea = await screen.findByPlaceholderText('반려 사유');
    await user.type(textarea, '조건이 달라요');
    await user.click(screen.getByRole('button', { name: '반려' }));
    await waitFor(() =>
      expect(declineMock).toHaveBeenCalledWith({ docId: 'doc-1', reason: '조건이 달라요' }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('반려 사유가 비어 있으면 확인 버튼이 비활성', async () => {
    const user = userEvent.setup();
    render(<ContractDocView {...buildProps({ canDecline: true })} />);
    await user.click(screen.getByRole('button', { name: '반려' }));
    await screen.findByPlaceholderText('반려 사유');
    const confirmButtons = screen.getAllByRole('button', { name: '반려' });
    expect(confirmButtons[confirmButtons.length - 1]).toBeDisabled();
  });
});

describe('ContractDocView — 회수 플로우', () => {
  it('canCancel 이면 회수 버튼 → 확인 다이얼로그 → cancelContractAction 호출', async () => {
    const user = userEvent.setup();
    render(<ContractDocView {...buildProps({ canCancel: true })} />);
    await user.click(screen.getByRole('button', { name: '회수' }));
    const confirmBtn = await screen.findByRole('button', { name: '회수' });
    await user.click(confirmBtn);
    await waitFor(() => expect(cancelMock).toHaveBeenCalledWith({ docId: 'doc-1' }));
    expect(refresh).toHaveBeenCalled();
  });
});

describe('ContractDocView — 서명자 변경 플로우', () => {
  const reassignMembers = [
    { userId: 'u-admin', name: '관리자', email: 'admin@x.com' },
    { userId: 'u-other', name: '멤버', email: 'other@x.com' },
  ];

  it('canReassign 이면 서명자 변경 버튼 → 멤버 선택 → reassignContractSignerAction 호출', async () => {
    const user = userEvent.setup();
    render(<ContractDocView {...buildProps({ canReassign: true, reassignMembers })} />);
    await user.click(screen.getByRole('button', { name: '서명자 변경' }));
    await screen.findByRole('button', { name: '변경' });
    await user.click(screen.getByRole('button', { name: '변경' }));
    await waitFor(() =>
      expect(reassignMock).toHaveBeenCalledWith({ docId: 'doc-1', newUserId: 'u-admin' }),
    );
    expect(refresh).toHaveBeenCalled();
  });
});
