import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PgSigningTemplate } from '@/lib/types/signing';

vi.mock('@/lib/server/actions/signing/deleteSigningTemplateAction', () => ({
  deleteSigningTemplateAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/signing/renameSigningTemplateAction', () => ({
  renameSigningTemplateAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/signing/listSigningTemplatesAction', () => ({
  listSigningTemplatesAction: vi.fn(),
}));

const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (m: string, o?: unknown) => toastMock(m, o) }));

// ContractTemplateEditor is a heavy PDF-upload/field-placement component tested on its
// own (Task 15) — here we only need to verify ContractTemplateList swaps to it and
// reacts correctly to its onSaved/onCancel callbacks, same rationale as
// QuoteTemplateList mocking QuoteTemplateDrawer.
vi.mock('../ContractTemplateEditor', () => ({
  ContractTemplateEditor: ({
    onSaved,
    onCancel,
  }: {
    onSaved: (templateId: string) => void;
    onCancel: () => void;
  }) => (
    <div>
      <label htmlFor="mock-tpl-name">템플릿 이름</label>
      <input id="mock-tpl-name" />
      <button type="button" onClick={() => onSaved('new-id')}>
        완료(mock 저장)
      </button>
      <button type="button" onClick={onCancel}>
        취소(mock)
      </button>
    </div>
  ),
}));

import { deleteSigningTemplateAction } from '@/lib/server/actions/signing/deleteSigningTemplateAction';
import { renameSigningTemplateAction } from '@/lib/server/actions/signing/renameSigningTemplateAction';
import { listSigningTemplatesAction } from '@/lib/server/actions/signing/listSigningTemplatesAction';
import { ContractTemplateList } from '../ContractTemplateList';

const initialTemplates: PgSigningTemplate[] = [
  {
    id: 't1',
    workspaceId: 'ws1',
    snowsignTemplateId: 's1',
    name: '표준 계약서',
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
  },
];

beforeEach(() => {
  vi.mocked(deleteSigningTemplateAction).mockReset();
  vi.mocked(renameSigningTemplateAction).mockReset();
  vi.mocked(listSigningTemplatesAction).mockReset();
  toastMock.mockClear();
});
afterEach(cleanup);

describe('ContractTemplateList', () => {
  it('renders the initial templates', () => {
    render(<ContractTemplateList initialTemplates={initialTemplates} />);
    expect(screen.getByText('표준 계약서')).toBeInTheDocument();
  });

  it('shows the editor when "새 템플릿 만들기" is clicked', async () => {
    render(<ContractTemplateList initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    expect(screen.getByLabelText('템플릿 이름')).toBeInTheDocument();
  });

  it('returns to the list when the editor is canceled', async () => {
    render(<ContractTemplateList initialTemplates={initialTemplates} />);
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    await userEvent.click(screen.getByRole('button', { name: '취소(mock)' }));
    expect(screen.getByText('표준 계약서')).toBeInTheDocument();
  });

  it('삭제를 누르면 확인창이 뜨고, 확인해야 실제로 삭제된다', async () => {
    vi.mocked(deleteSigningTemplateAction).mockResolvedValue({ ok: true });
    render(<ContractTemplateList initialTemplates={initialTemplates} />);

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));

    // 확인창이 뜨는 시점엔 아직 삭제 액션이 호출되지 않는다.
    expect(await screen.findByText('템플릿을 삭제할까요?')).toBeInTheDocument();
    expect(deleteSigningTemplateAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '삭제할게요' }));

    await waitFor(() => expect(screen.queryByText('표준 계약서')).not.toBeInTheDocument());
    expect(deleteSigningTemplateAction).toHaveBeenCalledWith({ templateId: 't1' });
  });

  it('확인창에서 취소하면 삭제되지 않는다', async () => {
    render(<ContractTemplateList initialTemplates={initialTemplates} />);

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(await screen.findByText('템플릿을 삭제할까요?')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.queryByText('템플릿을 삭제할까요?')).not.toBeInTheDocument();
    expect(deleteSigningTemplateAction).not.toHaveBeenCalled();
    expect(screen.getByText('표준 계약서')).toBeInTheDocument();
  });

  it('삭제가 실패하면 에러 토스트를 띄우고 목록에 남긴다', async () => {
    vi.mocked(deleteSigningTemplateAction).mockResolvedValue({ ok: false, error: 'NOT_FOUND' });
    render(<ContractTemplateList initialTemplates={initialTemplates} />);

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    await userEvent.click(screen.getByRole('button', { name: '삭제할게요' }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith('삭제하지 못했어요', { type: 'error' }),
    );
    expect(screen.getByText('표준 계약서')).toBeInTheDocument();
  });

  it('이름 변경 후 목록에 새 이름을 반영한다', async () => {
    vi.mocked(renameSigningTemplateAction).mockResolvedValue({ ok: true });
    render(<ContractTemplateList initialTemplates={initialTemplates} />);

    await userEvent.click(screen.getByRole('button', { name: '이름 변경' }));
    const input = screen.getByLabelText('템플릿 이름 변경');
    await userEvent.clear(input);
    await userEvent.type(input, '새 이름');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(renameSigningTemplateAction).toHaveBeenCalledWith({ templateId: 't1', name: '새 이름' }),
    );
    expect(screen.getByText('새 이름')).toBeInTheDocument();
  });

  it('이름 변경이 실패하면 에러 토스트를 띄우고 원래 이름을 유지한다', async () => {
    vi.mocked(renameSigningTemplateAction).mockResolvedValue({ ok: false, error: 'NOT_FOUND' });
    render(<ContractTemplateList initialTemplates={initialTemplates} />);

    await userEvent.click(screen.getByRole('button', { name: '이름 변경' }));
    const input = screen.getByLabelText('템플릿 이름 변경');
    await userEvent.clear(input);
    await userEvent.type(input, '새 이름');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith('이름을 바꾸지 못했어요', { type: 'error' }),
    );
    expect(screen.getByText('표준 계약서')).toBeInTheDocument();
  });

  // 이전 러프 엣지: onSaved(templateId)에서 서버가 돌려주는 건 id뿐이라 이름 등 나머지
  // 필드가 빈 채로 목록에 얹히면 잘못 렌더됐다. 저장 후 서버 목록을 다시 불러와
  // 정확한 값을 보여줘야 한다.
  it('저장 후 서버에서 최신 목록을 다시 불러와 정확한 이름을 보여준다', async () => {
    vi.mocked(listSigningTemplatesAction).mockResolvedValue({
      ok: true,
      templates: [
        {
          id: 'new-id',
          workspaceId: 'ws1',
          snowsignTemplateId: 's2',
          name: '방금 만든 계약서',
          createdBy: 'u1',
          createdAt: '2026-02-01T00:00:00Z',
        },
      ],
    });
    render(<ContractTemplateList initialTemplates={[]} />);

    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    await userEvent.click(screen.getByRole('button', { name: '완료(mock 저장)' }));

    await waitFor(() => expect(screen.getByText('방금 만든 계약서')).toBeInTheDocument());
    expect(listSigningTemplatesAction).toHaveBeenCalled();
    // 저장 직후 push했던 빈 placeholder(id만 채워진 항목)가 아니라 서버가 돌려준
    // 정확한 이름 하나만 목록에 있어야 한다.
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('저장 후 목록 재조회가 실패하면 에러 토스트를 띄운다', async () => {
    vi.mocked(listSigningTemplatesAction).mockResolvedValue({ ok: false, error: 'UNKNOWN' });
    render(<ContractTemplateList initialTemplates={[]} />);

    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    await userEvent.click(screen.getByRole('button', { name: '완료(mock 저장)' }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        '목록을 새로고침하지 못했어요. 새로고침해 주세요.',
        { type: 'error' },
      ),
    );
  });
});
