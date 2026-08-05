import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
// 생성된 로딩 태스크는 pdfTasks 에 쌓아 언마운트 해제 계약도 단언할 수 있게 한다.
const { pdfRenderSpy, pdfTasks } = vi.hoisted(() => ({
  pdfRenderSpy: vi.fn((_opts: { canvas: unknown; viewport: unknown }) => ({
    promise: Promise.resolve(),
  })),
  pdfTasks: [] as { destroy: ReturnType<typeof vi.fn> }[],
}));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => {
    const task = {
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 600, height: 800 }),
          render: pdfRenderSpy,
        }),
      }),
      destroy: vi.fn(),
    };
    pdfTasks.push(task);
    return task;
  },
}));

import { createSigningTemplateUploadSessionAction } from '@/lib/server/actions/signing/createSigningTemplateUploadSessionAction';
import { createSigningTemplateAction } from '@/lib/server/actions/signing/createSigningTemplateAction';
import { ContractTemplateEditor } from '../ContractTemplateEditor';

beforeEach(() => {
  // 스파이 이력·구현이 테스트 사이로 새면 어느 테스트가 어느 토스트를 만든 건지
  // 순서에 따라 달라진다 — 매 테스트를 깨끗한 상태에서 시작한다.
  toast.mockClear();
  vi.mocked(createSigningTemplateAction).mockReset();
  vi.mocked(createSigningTemplateUploadSessionAction).mockReset();
  pdfTasks.length = 0;
  vi.mocked(createSigningTemplateUploadSessionAction).mockResolvedValue({
    ok: true,
    uploadToken: 'tok_1',
    uploadUrl: 'https://example.com/upload',
    fields: {},
  });
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

// 업로드~파싱 완료(필드 툴바 등장)까지의 공통 셋업 — 라벨·완료 신호가 바뀌면
// 여기 한 곳만 고친다.
async function uploadPdf(name = 'a.pdf') {
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' });
  await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
  await screen.findByRole('button', { name: '구매사 서명' });
}

describe('ContractTemplateEditor', () => {
  it('disables save until both a buyer and a pg signable field are placed', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  // 저장이 왜 비활성인지 알려주지 않으면 사용자는 막다른 길에 갇힌다 — 남은 조건을
  // 체크리스트로 보여주고, 채워질수록 완료 표시가 켜진다(항목은 사라지지 않는다 —
  // 완료가 눈에 보여야 "다 됐다"를 확인할 수 있다).
  it('renders a save checklist whose items flip to done as conditions are met', async () => {
    vi.mocked(createSigningTemplateAction).mockResolvedValue({ ok: true, templateId: 't1' });
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);

    const items = () => screen.getAllByTestId('save-checklist-item');
    expect(items()).toHaveLength(4);
    expect(items().every((el) => el.dataset.done === 'false')).toBe(true);

    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
    await userEvent.click(await screen.findByRole('button', { name: '구매사 서명' }));
    await userEvent.click(screen.getByRole('button', { name: 'PG사 서명' }));
    await userEvent.type(screen.getByLabelText('템플릿 이름'), '표준 계약서');

    await waitFor(() => expect(items().every((el) => el.dataset.done === 'true')).toBe(true));
    expect(items()).toHaveLength(4);
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
  });

  // 에디터로 전환돼도 페이지 셸이 유지돼야 한다 — 제목이 담긴 헤더와 취소·저장 액션.
  // (기존에는 목록의 PageHeader 가 통째로 사라져 컨텍스트 없이 폼만 남았다.)
  it('renders its own page header with the editor title and actions', () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('heading', { name: '새 계약서 템플릿' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
  });

  // 네이티브 파일 인풋 문구("Choose File No file chosen")를 노출하지 않는다 —
  // 업로드 전에는 드롭존이, 업로드 후에는 파일명·쪽수 행과 교체 버튼이 보인다.
  it('shows a dropzone before upload and a file row with a replace button after', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: /계약서 PDF를 올려 주세요/ })).toBeInTheDocument();

    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
    await screen.findByRole('button', { name: '구매사 서명' });

    expect(screen.queryByRole('button', { name: /계약서 PDF를 올려 주세요/ })).not.toBeInTheDocument();
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText(/1쪽/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다른 파일로 바꾸기' })).toBeInTheDocument();
  });

  // 8개 평면 버튼 대신 구매사/PG사 그룹 — 시각 라벨은 짧게(서명·이름·날짜·텍스트),
  // 접근성 이름은 온전히(구매사 서명) 유지된다(label-in-name: 시각 라벨이 접근성
  // 이름에 포함되므로 음성 사용자와 화면 사용자가 같은 이름으로 부를 수 있다).
  it('groups field tools by party with short visible labels and full accessible names', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);

    const buyerSig = await screen.findByRole('button', { name: '구매사 서명' });
    expect(buyerSig.textContent).toBe('서명');
    expect(screen.getByText('구매사')).toBeInTheDocument();
    expect(screen.getByText('PG사')).toBeInTheDocument();
  });

  // '다른 파일로 바꾸기'로 새 PDF를 올리면 이전 문서에 배치한 필드는 초기화돼야 한다 —
  // 좌표는 문서에 종속이라, 남겨두면 새 문서에 없는 페이지의 필드까지 저장 페이로드에
  // 실려 나간다(화면에는 안 보이는데 서버로는 가는 잔존 데이터).
  it('clears placed fields when the PDF is replaced with a new file', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);

    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
    await userEvent.click(await screen.findByRole('button', { name: '구매사 서명' }));
    expect(screen.getAllByTestId('placed-field')).toHaveLength(1);

    const replacement = new File(['%PDF-1.4'], 'b.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), replacement);
    await screen.findByText('b.pdf');

    expect(screen.queryAllByTestId('placed-field')).toHaveLength(0);
  });

  // ✕ 삭제 버튼의 mousedown 이 선택 핸들러로 버블되면, 선택 중이던 다른 필드의
  // 선택을 빼앗은 채 삭제돼 아무것도 선택되지 않은 상태가 남는다 — 삭제는 남은
  // 필드의 선택을 건드리지 않아야 한다.
  it('keeps the current selection when deleting a different field', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
    await userEvent.click(await screen.findByRole('button', { name: '구매사 서명' }));
    await userEvent.click(screen.getByRole('button', { name: 'PG사 서명' }));

    // 마지막에 추가한 PG사 서명이 선택된 상태에서 구매사 서명을 삭제한다.
    await userEvent.click(screen.getByRole('button', { name: '구매사 서명 필드 삭제' }));

    const remaining = screen.getAllByTestId('placed-field');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.dataset.selected).toBe('true');
  });

  // 취소는 헤더로 이동했다 — 실제 버튼이 onCancel 에 배선돼 있는지 핀 고정
  // (목록 쪽 테스트는 에디터를 mock 하므로 여기가 유일한 실배선 검증이다).
  it('calls onCancel when the header cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalled();
  });

  // 체크리스트의 '서명 필드 배치' 판정은 서명 가능한 타입(signature/name)만 인정한다 —
  // 텍스트/날짜 필드로는 충족되지 않아야 한다(isSignable 이 무너지면 여기서 잡힌다).
  it('does not tick the buyer-signature checklist item for a non-signable field type', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
    await userEvent.click(await screen.findByRole('button', { name: '구매사 텍스트' }));

    const buyerItem = screen
      .getAllByTestId('save-checklist-item')
      .find((el) => el.textContent?.includes('구매사 서명 필드'));
    expect(buyerItem?.dataset.done).toBe('false');
  });

  // 드롭존 버튼은 숨겨진(sr-only) 파일 인풋을 대신 연다 — 배선이 끊어지면 업로드
  // 진입점 자체가 사라진다.
  it('opens the hidden file input when the dropzone is clicked', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByLabelText('계약서 PDF') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    await userEvent.click(screen.getByRole('button', { name: /계약서 PDF를 올려 주세요/ }));
    expect(clickSpy).toHaveBeenCalled();
  });

  // 방금 추가된 필드만 선택 강조된다 — 다른 필드를 클릭하면 선택이 옮겨간다.
  // (모든 박스가 같은 보더면 방금 추가한 칸이 어디 떨어졌는지 찾기 어렵다.)
  it('marks only the most recently added field as selected, and click moves selection', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
    await userEvent.click(await screen.findByRole('button', { name: '구매사 서명' }));
    await userEvent.click(screen.getByRole('button', { name: 'PG사 서명' }));

    const boxes = screen.getAllByTestId('placed-field');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.dataset.selected).toBe('false');
    expect(boxes[1]!.dataset.selected).toBe('true');

    await userEvent.click(boxes[0]!);
    expect(boxes[0]!.dataset.selected).toBe('true');
    expect(boxes[1]!.dataset.selected).toBe('false');
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

  // ── 프리랜딩 리뷰 반영분 ──

  // 저장 액션이 reject(네트워크 단절)하면 saving 이 영원히 true 로 남아 저장 버튼이
  // 죽은 채 굳는다 — 실패를 알리고 다시 시도할 수 있어야 한다(목록 쪽 삭제·이름변경과
  // 같은 try/finally 독트린).
  it('recovers with an error toast when the save action rejects', async () => {
    vi.mocked(createSigningTemplateAction).mockRejectedValue(new Error('network down'));
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    await uploadPdf();
    await userEvent.click(screen.getByRole('button', { name: '구매사 서명' }));
    await userEvent.click(screen.getByRole('button', { name: 'PG사 서명' }));
    await userEvent.type(screen.getByLabelText('템플릿 이름'), '표준 계약서');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        '템플릿을 저장하지 못했어요',
        expect.objectContaining({ type: 'error' }),
      ),
    );
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
  });

  // 교체 업로드가 진행되는 동안 이전 문서 기준의 canSave 가 살아 있다 — 이때 저장하면
  // 방금 바꾸기로 한 옛 PDF 로 템플릿이 만들어진다. 업로드 중에는 저장·필드 추가를 잠근다.
  it('disables save and the field toolbar while a replacement upload is in flight', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    await uploadPdf();
    await userEvent.click(screen.getByRole('button', { name: '구매사 서명' }));
    await userEvent.click(screen.getByRole('button', { name: 'PG사 서명' }));
    await userEvent.type(screen.getByLabelText('템플릿 이름'), '표준 계약서');
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();

    let resolvePost!: (r: { ok: boolean }) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise((r) => (resolvePost = r)));
    const replacement = new File(['%PDF-1.4'], 'b.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), replacement);

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '구매사 서명' })).toBeDisabled();

    resolvePost({ ok: true });
    await screen.findByText('b.pdf');
    expect(screen.getByRole('button', { name: '구매사 서명' })).toBeEnabled();
  });

  // 취소는 올린 PDF·배치한 서명칸을 즉시 버린다 — 작업물이 있으면 확인을 거친다
  // (SigningSendModal 의 이탈 확인과 같은 독트린).
  it('asks for confirmation before canceling when work would be lost', async () => {
    const onCancel = vi.fn();
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={onCancel} />);
    await uploadPdf();

    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).not.toHaveBeenCalled();
    await screen.findByText('작성을 그만둘까요?');

    await userEvent.click(screen.getByRole('button', { name: '그만둘게요' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
  });

  // 백지 상태의 취소는 잃을 것이 없다 — 확인 없이 바로 나간다.
  it('cancels immediately when nothing has been uploaded or placed', async () => {
    const onCancel = vi.fn();
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalled();
    expect(screen.queryByText('작성을 그만둘까요?')).not.toBeInTheDocument();
  });

  // 파일 검증 없이 세션부터 만들면 비-PDF·초과 파일이 업로드 세션과 제공자 스토리지를
  // 소모한 뒤에야 실패한다 — 세션 생성 전에 클라이언트에서 거른다.
  it('rejects a non-PDF file before creating an upload session', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const bad = new File(['hello'], 'a.txt', { type: 'text/plain' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), bad, { applyAccept: false });

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        'PDF 파일만 올릴 수 있어요',
        expect.objectContaining({ type: 'error' }),
      ),
    );
    expect(createSigningTemplateUploadSessionAction).not.toHaveBeenCalled();
  });

  it('rejects a PDF over the size cap before creating an upload session', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const big = new File(['%PDF-1.4'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 50 * 1024 * 1024 + 1 });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), big);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        'PDF는 50MB까지 올릴 수 있어요',
        expect.objectContaining({ type: 'error' }),
      ),
    );
    expect(createSigningTemplateUploadSessionAction).not.toHaveBeenCalled();
  });

  // 세션 발급 실패 분기 핀 — 토스트가 뜨고 필드 배치는 열리지 않는다.
  it('shows an error and no toolbar when the upload session cannot be created', async () => {
    vi.mocked(createSigningTemplateUploadSessionAction).mockResolvedValue({
      ok: false,
      error: 'FAIL',
    });
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        '업로드 세션을 만들지 못했어요',
        expect.objectContaining({ type: 'error' }),
      ),
    );
    expect(screen.queryByRole('button', { name: '구매사 서명' })).not.toBeInTheDocument();
  });

  // 업로드 POST 가 ok:false 로 떨어지는 분기 핀 — 403 뒤에 파싱·상태 설정으로
  // 진행하면 안 된다.
  it('shows an error and keeps the PDF checklist item unmet when the upload POST fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        'PDF 업로드에 실패했어요',
        expect.objectContaining({ type: 'error' }),
      ),
    );
    expect(screen.queryByRole('button', { name: '구매사 서명' })).not.toBeInTheDocument();
    const pdfItem = screen
      .getAllByTestId('save-checklist-item')
      .find((el) => el.textContent?.includes('PDF 올리기'));
    expect(pdfItem?.dataset.done).toBe('false');
  });

  // 업로드 후 유일한 업로드 진입점은 교체 버튼이다 — 배선이 끊어지면 PDF 를
  // 다시 올릴 방법 자체가 사라진다(드롭존 배선 핀과 같은 근거).
  it('opens the hidden file input when the replace button is clicked', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    await uploadPdf();
    const input = screen.getByLabelText('계약서 PDF') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    await userEvent.click(screen.getByRole('button', { name: '다른 파일로 바꾸기' }));
    expect(clickSpy).toHaveBeenCalled();
  });

  // 대시 보더 드롭존은 실제 드롭도 받는다 — 안 받으면 브라우저가 PDF 를 열러
  // 떠나며 에디터 상태가 통째로 사라진다.
  it('accepts a PDF dropped onto the dropzone', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    fireEvent.drop(screen.getByRole('button', { name: /계약서 PDF를 올려 주세요/ }), {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => expect(createSigningTemplateUploadSessionAction).toHaveBeenCalled());
  });

  // 업로드 도중 화면을 떠나면(취소 등) 파싱이 끝난 pdf.js 태스크가 어디에도 잡히지
  // 않은 채 남는다 — 언마운트 후 도착한 태스크는 즉시 해제한다(워커 메모리 반환).
  it('destroys a pdf.js task that finishes parsing after unmount', async () => {
    let resolvePost!: (r: { ok: boolean }) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise((r) => (resolvePost = r)));
    const { unmount } = render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);

    unmount();
    resolvePost({ ok: true });

    await waitFor(() => {
      expect(pdfTasks).toHaveLength(1);
      expect(pdfTasks[0]!.destroy).toHaveBeenCalled();
    });
  });
});
