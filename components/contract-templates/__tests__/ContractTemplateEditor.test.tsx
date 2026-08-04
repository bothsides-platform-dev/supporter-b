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
    uploadToken: 'tok_1',
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

  // 저장이 왜 비활성인지 알려주지 않으면 사용자는 막다른 길에 갇힌다 — 남은 조건을
  // 문장으로 보여주고, 전부 충족되면 힌트가 사라진다.
  it('shows what is still missing while save is disabled, and hides the hint once complete', async () => {
    vi.mocked(createSigningTemplateAction).mockResolvedValue({ ok: true, templateId: 't1' });
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(/계약서 PDF를 올려 주세요/)).toBeInTheDocument();
    expect(screen.getByText(/템플릿 이름을 입력해 주세요/)).toBeInTheDocument();
    expect(screen.getByText(/구매사 서명 필드를 배치해 주세요/)).toBeInTheDocument();
    expect(screen.getByText(/PG사 서명 필드를 배치해 주세요/)).toBeInTheDocument();

    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
    await userEvent.click(await screen.findByRole('button', { name: '구매사 서명' }));
    await userEvent.click(screen.getByRole('button', { name: 'PG사 서명' }));
    await userEvent.type(screen.getByLabelText('템플릿 이름'), '표준 계약서');

    expect(screen.queryByText(/올려 주세요|입력해 주세요|배치해 주세요/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
  });

  // 업로드~파싱은 수 초가 걸릴 수 있다 — 진행 표시가 없으면 화면이 무반응으로 보인다.
  it('shows a loading indicator while the PDF is uploading/parsing', async () => {
    let resolvePut!: (r: { ok: boolean }) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise((r) => (resolvePut = r)));
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);

    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);

    expect(await screen.findByText(/PDF를 불러오는 중이에요/)).toBeInTheDocument();

    resolvePut({ ok: true });
    await screen.findByRole('button', { name: '구매사 서명' });
    expect(screen.queryByText(/PDF를 불러오는 중이에요/)).not.toBeInTheDocument();
  });

  // 배치된 필드 칩은 전부 한국어다('구매사 signature' 같은 한영 혼용 금지) —
  // 삭제 버튼도 어떤 필드를 지우는지 접근성 이름으로 알린다.
  it('placed field chips are fully Korean and the delete button names its field', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
    await userEvent.click(await screen.findByRole('button', { name: '구매사 서명' }));

    expect(screen.queryByText(/signature|name|date|text/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '구매사 서명 필드 삭제' })).toBeInTheDocument();
  });

  // 여러 페이지 문서에서 필드가 어느 페이지에 떨어질지 알 수 있어야 한다 —
  // 페이지마다 번호 라벨을 단다.
  it('labels each rendered page with its page number', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
    await screen.findByRole('button', { name: '구매사 서명' });

    expect(screen.getByText('1페이지')).toBeInTheDocument();
  });

  it('calls createSigningTemplateAction with the placed fields and reports onSaved on success', async () => {
    vi.mocked(createSigningTemplateAction).mockResolvedValue({ ok: true, templateId: 't1' });
    const onSaved = vi.fn();
    render(<ContractTemplateEditor onSaved={onSaved} onCancel={vi.fn()} />);

    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
    await waitFor(() => expect(createSigningTemplateUploadSessionAction).toHaveBeenCalled());

    // 업로드 세션 발급 이후에도 업로드 POST + pdf.js 페이지 파싱까지 몇 번의 비동기 단계가
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
          uploadToken: 'tok_1',
          fields: expect.arrayContaining([
            expect.objectContaining({ party: 'buyer', type: 'signature' }),
            expect.objectContaining({ party: 'pg', type: 'signature' }),
          ]),
        }),
      ),
    );
    expect(onSaved).toHaveBeenCalledWith('t1');
  });

  // 서버는 SNOWSIGN_* 쿼터·검증 등 코드를 구분해 돌려주는데 화면이 전부
  // '템플릿을 저장하지 못했어요'로 뭉개면 사용자는 원인도 다음 행동도 모른다 —
  // 코드→문구 SSOT(signingErrorMessage)를 거쳐야 한다.
  it('maps a known save-error code to its friendly message instead of the generic toast', async () => {
    vi.mocked(createSigningTemplateAction).mockResolvedValue({
      ok: false,
      error: 'SNOWSIGN_QUOTA_EXCEEDED',
    });
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);

    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
    await userEvent.click(await screen.findByRole('button', { name: '구매사 서명' }));
    await userEvent.click(screen.getByRole('button', { name: 'PG사 서명' }));
    await userEvent.type(screen.getByLabelText('템플릿 이름'), '표준 계약서');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        '전자서명 사용량 한도에 도달했어요. 잠시 후 다시 시도해 주세요.',
        expect.objectContaining({ type: 'error' }),
      ),
    );
    // 알 수 없는 코드는 여전히 일반 문구로 떨어진다.
    toast.mockClear();
    vi.mocked(createSigningTemplateAction).mockResolvedValue({
      ok: false,
      error: 'TOTALLY_UNKNOWN',
    });
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        '템플릿을 저장하지 못했어요',
        expect.objectContaining({ type: 'error' }),
      ),
    );
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

  // 실측(2026-08-03, scripts/signing/snowsign-smoke.ts --template T2)에서 확정된 계약:
  // `/v1/uploads` 가 주는 것은 **S3 presigned POST** 다(fields = key·policy·
  // x-amz-signature…). raw PUT 은 실 API 에서 HTTP 403 이고, presigned POST 는 204 다.
  // 기존 코드는 R2 첨부(presigned PUT) 패턴을 그대로 가져다 써서 fields 를 버리고
  // PUT 을 쐈고, 그래서 PG 는 계약서 템플릿을 **한 건도 등록할 수 없었다**.
  // 이 테스트가 없어서 전송 방식이 한 번도 고정되지 않았다(기존 테스트는 fetch 가
  // resolve 하는지만 봤다 — PUT 이든 POST 든 통과한다).
  it('uploads the PDF as a presigned multipart POST with every field, file last (not a raw PUT)', async () => {
    vi.mocked(createSigningTemplateUploadSessionAction).mockResolvedValue({
      ok: true,
      uploadToken: 'tok_1',
      uploadUrl: 'https://example.com/upload',
      fields: { key: 'uploads/upl_1', 'Content-Type': 'application/pdf', policy: 'p', 'x-amz-signature': 'sig' },
    });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    global.fetch = fetchSpy;

    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const [url, init] = fetchSpy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://example.com/upload');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);

    const entries = [...(init.body as FormData).entries()];
    const keys = entries.map(([k]) => k);
    // 서명에 포함된 필드가 하나라도 빠지면 S3 가 403 을 준다.
    expect(keys).toEqual(expect.arrayContaining(['key', 'Content-Type', 'policy', 'x-amz-signature']));
    // `file` 은 반드시 마지막 — S3 는 file 뒤에 오는 필드를 무시한다.
    expect(keys[keys.length - 1]).toBe('file');
    expect(entries.find(([k]) => k === 'key')?.[1]).toBe('uploads/upl_1');

    // Content-Type 은 **폼 필드**로만 간다. 요청 헤더로 박으면 브라우저가 multipart
    // boundary 를 못 붙여 본문이 통째로 깨진다.
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('content-type');
  });

  it('shows an error toast and keeps field placement disabled when the PDF upload throws (network failure)', async () => {
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
    // uploadId never got set (the upload never succeeded), so the field toolbar — which
    // only renders once a PDF has been parsed into pages — must not appear.
    expect(screen.queryByRole('button', { name: '구매사 서명' })).not.toBeInTheDocument();
    // 같은 파일을 다시 골라도 onChange 가 다시 발화하도록 input 값은 비워져 있어야 한다
    // (브라우저는 값이 같으면 change 를 내지 않는다 — 재시도가 조용히 무시되는 원인).
    expect((screen.getByLabelText('계약서 PDF') as HTMLInputElement).value).toBe('');
  });
});
