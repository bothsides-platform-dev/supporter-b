import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ContractTemplate } from '@/lib/types/contract-doc';
import type { ContractCreateFormProps } from '../ContractCreateForm';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, refresh: vi.fn() }) }));

type SendResult =
  | { ok: true; docId: string; code: string }
  | { ok: false; error: string };
const sendMock = vi.fn<(i: unknown) => Promise<SendResult>>(async () => ({
  ok: true,
  docId: 'new-doc-id',
  code: 'CT-2605-0002',
}));
vi.mock('@/lib/server/actions/contract', () => ({
  sendContractAction: (i: unknown) => sendMock(i),
}));

import { ContractCreateForm } from '../ContractCreateForm';

function tmpl(over?: Partial<ContractTemplate>): ContractTemplate {
  return {
    id: 'tmpl-1',
    pgWsId: 'ws-pg',
    name: '표준 계약서',
    description: '',
    createdBy: 'u1',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    attachment: { id: 'att-1', name: 'a.pdf', size: 100 },
    ...over,
  };
}

function buildProps(over?: Partial<ContractCreateFormProps>): ContractCreateFormProps {
  return {
    rfp: { code: 'P-2605-0042', title: '결제대행 RFP' },
    templates: [tmpl()],
    buyerPrefill: { name: '(주)구매사', bizNo: '123-45-67890', repName: '' },
    pgPrefill: { name: 'PG사', bizNo: null, repName: '' },
    buyerSignerName: '김구매담당',
    pgMembers: [
      { userId: 'u-viewer', name: '나', email: 'me@pg.com' },
      { userId: 'u-other', name: '동료', email: 'other@pg.com' },
    ],
    defaultExpiresDays: 14,
    viewerUserId: 'u-viewer',
    ...over,
  };
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId('buyer-repName'), '김대표');
  await user.type(screen.getByTestId('pg-repName'), '이대표');
}

beforeEach(() => {
  pushMock.mockClear();
  sendMock.mockReset().mockResolvedValue({ ok: true, docId: 'new-doc-id', code: 'CT-2605-0002' });
});
afterEach(cleanup);

describe('ContractCreateForm — 템플릿 없음', () => {
  it('templates=[] 면 EmptyState + 계약 템플릿 관리로 이동 링크를 렌더한다', () => {
    render(<ContractCreateForm {...buildProps({ templates: [] })} />);
    expect(screen.getByText('계약서 템플릿이 없어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /계약 템플릿 관리로 이동/ })).toHaveAttribute(
      'href',
      '/contract-templates',
    );
  });
});

describe('ContractCreateForm — 기본값', () => {
  it('제목 기본값은 "{rfp.title} 계약"이다', () => {
    render(<ContractCreateForm {...buildProps()} />);
    expect(screen.getByDisplayValue('결제대행 RFP 계약')).toBeInTheDocument();
  });

  it('갑/을 프리필 값을 채운다', () => {
    render(<ContractCreateForm {...buildProps()} />);
    expect(screen.getByTestId('buyer-name')).toHaveValue('(주)구매사');
    expect(screen.getByTestId('buyer-bizNo')).toHaveValue('123-45-67890');
    expect(screen.getByTestId('pg-name')).toHaveValue('PG사');
    expect(screen.getByTestId('pg-bizNo')).toHaveValue('');
  });

  it('을측 서명자 기본값은 뷰어 본인이다', () => {
    render(<ContractCreateForm {...buildProps()} />);
    expect(screen.getByDisplayValue('나 (me@pg.com)')).toBeInTheDocument();
  });

  it('갑측 서명자는 buyerSignerName 을 고정 표기한다', () => {
    render(<ContractCreateForm {...buildProps()} />);
    expect(screen.getByText('김구매담당')).toBeInTheDocument();
    expect(screen.getByText('구매사 관리자가 변경할 수 있어요')).toBeInTheDocument();
  });

  it('"본문 미리보기" 링크가 선택된 템플릿의 첨부를 가리킨다', () => {
    render(<ContractCreateForm {...buildProps()} />);
    expect(screen.getByRole('link', { name: '본문 미리보기' })).toHaveAttribute(
      'href',
      '/api/files/att-1',
    );
  });
});

describe('ContractCreateForm — 필수값 게이팅', () => {
  it('대표자명(갑/을)이 비어 있으면 보내기 버튼이 비활성', () => {
    render(<ContractCreateForm {...buildProps()} />);
    expect(screen.getByRole('button', { name: '계약서 보내기' })).toBeDisabled();
  });

  it('갑/을 대표자명을 모두 채우면 버튼이 활성화된다', async () => {
    const user = userEvent.setup();
    render(<ContractCreateForm {...buildProps()} />);
    await fillRequired(user);
    expect(screen.getByRole('button', { name: '계약서 보내기' })).toBeEnabled();
  });
});

describe('ContractCreateForm — 발송 플로우', () => {
  it('보내기 클릭 → 확인 다이얼로그에 고지 문구를 보여준다', async () => {
    const user = userEvent.setup();
    render(<ContractCreateForm {...buildProps()} />);
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: '계약서 보내기' }));
    expect(
      await screen.findByText(/개요 별지는 요약이며 계약 본문이 우선해요/),
    ).toBeInTheDocument();
  });

  it('확인 시 sendContractAction 을 호출하고 성공하면 /contracts/{docId} 로 이동한다', async () => {
    const user = userEvent.setup();
    render(<ContractCreateForm {...buildProps()} />);
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: '계약서 보내기' }));
    await user.click(await screen.findByRole('button', { name: '보내기' }));
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith({
        rfpCode: 'P-2605-0042',
        templateId: 'tmpl-1',
        title: '결제대행 RFP 계약',
        parties: {
          _v: 1,
          buyer: { name: '(주)구매사', repName: '김대표', bizNo: '123-45-67890' },
          pg: { name: 'PG사', repName: '이대표', bizNo: null },
        },
        pgSignerUserId: 'u-viewer',
        expiresInDays: 14,
      }),
    );
    expect(pushMock).toHaveBeenCalledWith('/contracts/new-doc-id');
  });

  it('ACTIVE_DOC_EXISTS 에러는 "이미 서명 대기 중인 계약서가 있어요."로 표시된다', async () => {
    sendMock.mockResolvedValueOnce({ ok: false, error: 'ACTIVE_DOC_EXISTS' });
    const user = userEvent.setup();
    render(<ContractCreateForm {...buildProps()} />);
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: '계약서 보내기' }));
    await user.click(await screen.findByRole('button', { name: '보내기' }));
    expect(await screen.findByText('이미 서명 대기 중인 계약서가 있어요.')).toBeInTheDocument();
  });
});
