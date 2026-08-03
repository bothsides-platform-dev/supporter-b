import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

vi.mock('@/lib/server/actions/signing/createSigningTemplateUploadSessionAction', () => ({
  createSigningTemplateUploadSessionAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/signing/createSigningTemplateAction', () => ({
  createSigningTemplateAction: vi.fn(),
}));
// pdf.js jsdom mock — render 는 스파이로 승격해 "본문을 실제로 canvas 에 그리는가"를
// 단언할 수 있게 한다(진짜 픽셀 검증은 jsdom 에서 불가능하므로 render 호출 계약까지만).
const { pdfRenderSpy } = vi.hoisted(() => ({
  pdfRenderSpy: vi.fn((_opts: { canvas: unknown; viewport: unknown }) => ({
    promise: Promise.resolve(),
  })),
}));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getViewport: () => ({ width: 600, height: 800 }),
        render: pdfRenderSpy,
      }),
    }),
    destroy: vi.fn(),
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

  it('renders the actual PDF page content onto a per-page canvas (not a blank rectangle)', async () => {
    // 이 계약이 없으면 에디터는 페이지 크기의 빈 사각형만 보여줘 사용자가 계약서
    // 본문을 못 본 채 서명칸을 놓게 된다. 진짜 픽셀은 jsdom 에서 검증 불가하므로
    // "페이지별 canvas 가 존재하고 pdf.js render 가 그 canvas 로 호출된다"까지 단언한다.
    pdfRenderSpy.mockClear();
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
    await screen.findByRole('button', { name: '구매사 서명' });

    // 페이지마다 viewport 크기의 canvas 가 실제로 존재하고,
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-page-canvas="1"]');
    expect(canvas).not.toBeNull();
    expect(canvas!.width).toBe(600);
    expect(canvas!.height).toBe(800);

    // pdf.js 의 page.render 가 바로 그 canvas 요소로 호출됐어야 한다(v6 API — canvas 직접 전달).
    await waitFor(() => expect(pdfRenderSpy).toHaveBeenCalled());
    expect(pdfRenderSpy.mock.calls[0]![0].canvas).toBe(canvas);
  });

  it('shows an error toast and keeps field placement disabled when the PDF PUT throws (network failure)', async () => {
    // fetch throwing (vs. resolving {ok:false}) is the case that used to become a
    // silent unhandled promise rejection, since handleUpload is invoked as
    // `void handleUpload(file)` from the file input's onChange with nothing to
    // catch a rejection.
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);

    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('PDF를 처리하지 못했어요', expect.objectContaining({ type: 'error' })),
    );
    // uploadId never got set (PUT never succeeded), so the field toolbar — which
    // only renders once a PDF has been parsed into pages — must not appear.
    expect(screen.queryByRole('button', { name: '구매사 서명' })).not.toBeInTheDocument();
  });
});
