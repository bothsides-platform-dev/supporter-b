import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ContractArchiveEntry } from '@/lib/types/contract-archive';

type MockResult = { ok: true } | { ok: false; error: string };
const deleteMock = vi.fn<(i: unknown) => Promise<MockResult>>();
vi.mock('@/lib/server/actions/contract-archive', () => ({
  deleteContractArchiveAction: (i: unknown) => deleteMock(i),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (m: string, o?: unknown) => toastMock(m, o) }));

// 업로드 다이얼로그는 따로 테스트한다 — 여기선 열림/닫힘만 본다.
vi.mock('../ContractArchiveUploadDialog', () => ({
  ContractArchiveUploadDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="upload-open" /> : null,
}));

import { ContractArchiveList } from '../ContractArchiveList';

function entry(o: Partial<ContractArchiveEntry> = {}): ContractArchiveEntry {
  return {
    id: 'a1',
    source: 'signing',
    status: 'ready',
    title: '결제대행 서비스 이용계약',
    counterpartyName: '토스페이먼츠',
    rfpCode: 'P-2607-0042',
    contractedAt: '2026-08-01T09:00:00.000Z',
    documentName: '완료본.pdf',
    hasAudit: true,
    dealHref: '/rfp/P-2607-0042',
    canDelete: false,
    createdAt: '2026-08-01T09:00:01.000Z',
    ...o,
  };
}

beforeEach(() => {
  deleteMock.mockReset();
  deleteMock.mockResolvedValue({ ok: true });
  refresh.mockReset();
  toastMock.mockReset();
});
afterEach(cleanup);

describe('ContractArchiveList', () => {
  // 보존 원칙 — 자동 보관본은 지울 수 없다. 서버가 SSOT 이고 UI 는 버튼을 숨긴다.
  it('전자서명 보관본에는 삭제 버튼을 렌더하지 않는다', () => {
    render(<ContractArchiveList initialEntries={[entry({ canDelete: false })]} />);
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull();
  });

  it('직접 업로드에는 삭제 버튼이 있다', () => {
    render(
      <ContractArchiveList initialEntries={[entry({ source: 'upload', canDelete: true })]} />,
    );
    expect(screen.getByRole('button', { name: '삭제' })).toBeTruthy();
  });

  // RFP 삭제로 딜이 죽으면 견적번호 스냅샷은 남지만 링크는 404 로 간다.
  it('딜이 죽은 행의 견적번호는 링크가 아니다', () => {
    render(<ContractArchiveList initialEntries={[entry({ dealHref: null })]} />);
    expect(screen.getByText('P-2607-0042')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'P-2607-0042' })).toBeNull();
  });

  it('딜이 살아 있으면 견적번호가 딜룸 링크다', () => {
    render(<ContractArchiveList initialEntries={[entry()]} />);
    const link = screen.getByRole('link', { name: 'P-2607-0042' });
    expect(link.getAttribute('href')).toBe('/rfp/P-2607-0042');
  });

  // pending 은 R2 에 바이트가 아직 없다 — 링크를 주면 409 로 간다.
  it('보관 준비 중인 행에는 다운로드 링크가 없다', () => {
    render(<ContractArchiveList initialEntries={[entry({ status: 'pending' })]} />);
    expect(screen.getByText('보관 준비 중')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /계약서/ })).toBeNull();
  });

  it('인증서가 없는 행에는 인증서 링크가 없다', () => {
    render(<ContractArchiveList initialEntries={[entry({ hasAudit: false })]} />);
    expect(screen.getByRole('link', { name: /계약서/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /인증서/ })).toBeNull();
  });

  // 로드 실패를 "없어요"로 위장하면 사용자는 계약서가 사라진 줄 안다.
  it('로드 실패는 빈 상태가 아니라 실패로 말한다', () => {
    render(<ContractArchiveList initialEntries={[]} loadFailed />);
    expect(screen.getByText('목록을 불러오지 못했어요')).toBeTruthy();
    expect(screen.queryByText('아직 보관된 계약서가 없어요')).toBeNull();
  });

  it('검색이 제목·상대방으로 걸러낸다', async () => {
    const user = userEvent.setup();
    render(
      <ContractArchiveList
        initialEntries={[
          entry({ id: 'a1', title: '결제대행 계약' }),
          entry({ id: 'a2', title: '유지보수 계약', counterpartyName: '다른회사' }),
        ]}
      />,
    );
    await user.type(screen.getByRole('searchbox', { name: '계약서 검색' }), '유지보수');

    await waitFor(() => expect(screen.queryByText('결제대행 계약')).toBeNull());
    expect(screen.getByText('유지보수 계약')).toBeTruthy();
  });

  it('삭제 확인 후 액션을 부르고 목록을 갱신한다', async () => {
    const user = userEvent.setup();
    render(
      <ContractArchiveList
        initialEntries={[entry({ id: 'up1', source: 'upload', canDelete: true })]}
      />,
    );
    await user.click(screen.getByRole('button', { name: '삭제' }));
    await user.click(screen.getByRole('button', { name: '지울게요' }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith({ id: 'up1' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  // 확인창이 열린 채 굳으면 빠져나갈 길이 없다 — 실패해도 닫힌다.
  it('삭제가 실패해도 확인창은 닫고 이유를 알린다', async () => {
    const user = userEvent.setup();
    deleteMock.mockResolvedValue({ ok: false, error: 'ARCHIVE_NOT_DELETABLE' });
    render(
      <ContractArchiveList
        initialEntries={[entry({ id: 'up1', source: 'upload', canDelete: true })]}
      />,
    );
    await user.click(screen.getByRole('button', { name: '삭제' }));
    await user.click(screen.getByRole('button', { name: '지울게요' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: '지울게요' })).toBeNull());
    expect(toastMock).toHaveBeenCalledWith(
      '전자서명으로 보관된 계약서는 지울 수 없어요.',
      expect.objectContaining({ type: 'error' }),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
