import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type SaveResult = { ok: true; templateId: string } | { ok: false; error: string };
const saveMock = vi.fn<(i: unknown) => Promise<SaveResult>>(async () => ({
  ok: true,
  templateId: 'new-id',
}));
vi.mock('@/lib/server/actions/contract-template', () => ({
  saveContractTemplateAction: (i: unknown) => saveMock(i),
}));

const uploadMock = vi.fn(async (_file: File, _opts: unknown) => ({
  id: 'att-1',
  name: 'a.pdf',
  size: 100,
  mimeType: 'application/pdf',
}));
vi.mock('@/lib/attachments/upload-client', () => ({
  uploadAttachment: (file: File, opts: unknown) => uploadMock(file, opts),
}));

import { ContractTemplateUploadDrawer } from '../ContractTemplateUploadDrawer';

function pdfFile(name = 'a.pdf') {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

beforeEach(() => {
  saveMock.mockClear();
  uploadMock.mockClear();
});
afterEach(cleanup);

describe('ContractTemplateUploadDrawer', () => {
  it('open=false 면 아무것도 렌더하지 않는다', () => {
    const { container } = render(
      <ContractTemplateUploadDrawer open={false} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('파일 선택 전에는 저장 버튼이 비활성', () => {
    render(<ContractTemplateUploadDrawer open onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('이름 입력 + 파일 선택 후 저장하면 uploadAttachment → saveContractTemplateAction 순으로 호출된다', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<ContractTemplateUploadDrawer open onClose={vi.fn()} onSaved={onSaved} />);

    await user.type(screen.getByPlaceholderText('템플릿 이름'), '표준 계약서');
    await user.upload(fileInput(), pdfFile());

    await waitFor(() =>
      expect(uploadMock).toHaveBeenCalledWith(expect.any(File), {
        ownerKind: 'contract_template',
        ownerId: '__draft__',
      }),
    );
    await screen.findByText(/a\.pdf/);

    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith({ name: '표준 계약서', attachmentId: 'att-1' }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('이름 없이는 업로드가 끝나도 저장 버튼이 비활성', async () => {
    const user = userEvent.setup();
    render(<ContractTemplateUploadDrawer open onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.upload(fileInput(), pdfFile());
    await screen.findByText(/a\.pdf/);
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('PDF 가 아닌 파일은 거부하고 에러를 보여준다', async () => {
    // input accept=".pdf" 를 우회해 컴포넌트 자체의 방어 로직(비 PDF 거부)을 검증한다.
    const user = userEvent.setup({ applyAccept: false });
    render(<ContractTemplateUploadDrawer open onClose={vi.fn()} onSaved={vi.fn()} />);
    const png = new File(['x'], 'a.png', { type: 'image/png' });
    await user.upload(fileInput(), png);
    expect(await screen.findByText('PDF 파일만 업로드할 수 있어요')).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('업로드 실패 시 에러 메시지를 보여주고 저장 버튼은 비활성 상태를 유지한다', async () => {
    const user = userEvent.setup();
    uploadMock.mockRejectedValueOnce(new Error('네트워크 오류'));
    render(<ContractTemplateUploadDrawer open onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.upload(fileInput(), pdfFile());
    expect(await screen.findByText('네트워크 오류')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('저장 액션이 실패하면 에러 코드 문구를 보여준다', async () => {
    const user = userEvent.setup();
    saveMock.mockResolvedValueOnce({ ok: false, error: 'LIMIT_REACHED' });
    render(<ContractTemplateUploadDrawer open onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('템플릿 이름'), '표준 계약서');
    await user.upload(fileInput(), pdfFile());
    await screen.findByText(/a\.pdf/);
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(
      await screen.findByText('계약서 템플릿은 최대 20개까지 저장할 수 있어요.'),
    ).toBeInTheDocument();
  });

  it('"취소" 클릭 시 onClose 를 호출한다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ContractTemplateUploadDrawer open onClose={onClose} onSaved={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(onClose).toHaveBeenCalled();
  });
});
