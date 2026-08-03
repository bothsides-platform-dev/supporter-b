import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/server/actions/signing/createSigningTemplateUploadSessionAction', () => ({
  createSigningTemplateUploadSessionAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/signing/createSigningTemplateAction', () => ({
  createSigningTemplateAction: vi.fn(),
}));
// pdf.js는 jsdom에서 canvas 렌더링이 무의미하므로 페이지 수/뷰포트만 흉내내는 얇은 mock을 쓴다.
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getViewport: () => ({ width: 600, height: 800 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
  }),
}));

import { createSigningTemplateUploadSessionAction } from '@/lib/server/actions/signing/createSigningTemplateUploadSessionAction';
import { createSigningTemplateAction } from '@/lib/server/actions/signing/createSigningTemplateAction';
import { ContractTemplateEditor } from '../ContractTemplateEditor';

beforeEach(() => {
  vi.mocked(createSigningTemplateUploadSessionAction).mockResolvedValue({
    ok: true,
    uploadId: 'upl_1',
    uploadUrl: 'https://example.com/upload',
    fields: {},
  });
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

describe('ContractTemplateEditor', () => {
  it('disables save until both a buyer and a pg signable field are placed', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('calls createSigningTemplateAction with the placed fields and reports onSaved on success', async () => {
    vi.mocked(createSigningTemplateAction).mockResolvedValue({ ok: true, templateId: 't1' });
    const onSaved = vi.fn();
    render(<ContractTemplateEditor onSaved={onSaved} onCancel={vi.fn()} />);

    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
    await waitFor(() => expect(createSigningTemplateUploadSessionAction).toHaveBeenCalled());

    // 업로드 세션 발급 이후에도 PUT + pdf.js 페이지 파싱까지 몇 번의 비동기 단계가
    // 더 있다 — 필드 툴바는 그게 다 끝난 뒤에야 나타나므로 findByRole로 기다린다
    // (getByRole은 재시도가 없어 여기서 쓰면 레이스로 떨어질 수 있다).
    await userEvent.click(await screen.findByRole('button', { name: '구매사 서명' }));
    await userEvent.click(screen.getByRole('button', { name: 'PG사 서명' }));
    await userEvent.type(screen.getByLabelText('템플릿 이름'), '표준 계약서');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(createSigningTemplateAction).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '표준 계약서',
          documentUploadId: 'upl_1',
          fields: expect.arrayContaining([
            expect.objectContaining({ party: 'buyer', type: 'signature' }),
            expect.objectContaining({ party: 'pg', type: 'signature' }),
          ]),
        }),
      ),
    );
    expect(onSaved).toHaveBeenCalledWith('t1');
  });
});
