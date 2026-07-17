import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ContractTemplate } from '@/lib/types/contract-doc';

const deleteMock = vi.fn(async (_i: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/contract-template', () => ({
  deleteContractTemplateAction: (i: unknown) => deleteMock(i),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

// ContractTemplateUploadDrawer는 별도 테스트 — 열림/닫힘 상태만 확인.
vi.mock('@/components/contract-templates/ContractTemplateUploadDrawer', () => ({
  ContractTemplateUploadDrawer: ({ open }: { open: boolean }) =>
    open ? <div data-testid="drawer-open" /> : null,
}));

import { ContractTemplateList } from '../ContractTemplateList';

const tmpl = (over: Partial<ContractTemplate> = {}): ContractTemplate => ({
  id: 't1',
  pgWsId: 'ws-pg',
  name: '표준 계약서',
  description: '',
  createdBy: 'u1',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  attachment: { id: 'att-1', name: '표준계약서.pdf', size: 123_456 },
  ...over,
});

beforeEach(() => {
  deleteMock.mockClear();
  refresh.mockClear();
});
afterEach(cleanup);

describe('ContractTemplateList', () => {
  it('빈 목록이면 빈 상태 안내를 보여준다', () => {
    render(<ContractTemplateList initialTemplates={[]} />);
    expect(screen.getByText('아직 등록된 계약 템플릿이 없어요')).toBeInTheDocument();
  });

  it('템플릿 이름·파일명·업로드일을 목록에 표시한다', () => {
    render(<ContractTemplateList initialTemplates={[tmpl()]} />);
    expect(screen.getByText('표준 계약서')).toBeInTheDocument();
    expect(screen.getByText(/표준계약서\.pdf/)).toBeInTheDocument();
  });

  it('첨부가 있으면 "본문 보기" 링크가 /api/files/{attachmentId} 를 가리킨다', () => {
    render(<ContractTemplateList initialTemplates={[tmpl({ attachment: { id: 'att-9', name: 'a.pdf', size: 1 } })]} />);
    expect(screen.getByRole('link', { name: '본문 보기' })).toHaveAttribute(
      'href',
      '/api/files/att-9',
    );
  });

  it('첨부가 없으면 "본문 보기" 링크를 렌더하지 않는다', () => {
    render(<ContractTemplateList initialTemplates={[tmpl({ attachment: null })]} />);
    expect(screen.queryByRole('link', { name: '본문 보기' })).not.toBeInTheDocument();
  });

  it('"새 템플릿" 버튼 클릭 시 드로어가 열린다', async () => {
    const user = userEvent.setup();
    render(<ContractTemplateList initialTemplates={[]} />);
    await user.click(screen.getByRole('button', { name: /새 템플릿/ }));
    expect(screen.getByTestId('drawer-open')).toBeInTheDocument();
  });

  it('"삭제" 버튼 → 확인 다이얼로그 → 삭제 확인 시 deleteContractTemplateAction 호출 후 router.refresh', async () => {
    const user = userEvent.setup();
    render(<ContractTemplateList initialTemplates={[tmpl({ id: 'del-id' })]} />);
    await user.click(screen.getByRole('button', { name: '삭제' }));
    const confirmBtn = await screen.findByRole('button', { name: /삭제할게요/ });
    await user.click(confirmBtn);
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith({ templateId: 'del-id' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('템플릿 수를 "N / 20개"로 표시한다', () => {
    render(<ContractTemplateList initialTemplates={[tmpl()]} />);
    expect(screen.getByText('1 / 20개')).toBeInTheDocument();
  });
});
