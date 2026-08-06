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
vi.mock('@/lib/server/actions/signing/getSigningTemplateDetailAction', () => ({
  getSigningTemplateDetailAction: vi.fn(),
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
    initial,
  }: {
    onSaved: (templateId: string) => void;
    onCancel: () => void;
    initial?: {
      templateId: string;
      name: string;
      fields: unknown[];
      pdfBytes: ArrayBuffer;
      fileName: string;
    };
  }) => (
    <div
      data-testid="mock-editor"
      data-initial-template={initial?.templateId}
      data-initial-name={initial?.name}
      data-initial-fields={initial?.fields.length}
      data-initial-file={initial?.fileName}
      data-initial-bytes={initial?.pdfBytes.byteLength}
    >
      <label htmlFor="mock-tpl-name">템플릿 이름</label>
      <input id="mock-tpl-name" />
      <button type="button" onClick={() => onSaved(initial?.templateId ?? 'new-id')}>
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
import { getSigningTemplateDetailAction } from '@/lib/server/actions/signing/getSigningTemplateDetailAction';
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
  vi.mocked(getSigningTemplateDetailAction).mockReset();
  toastMock.mockClear();
});
afterEach(() => {
  cleanup();
  // 테스트 본문 마지막 줄의 unstub 은 단언 실패 시 실행되지 않아 스텁된 fetch 가
  // 다음 테스트로 새어 실패 원인을 가린다 — 훅에서 항상 되돌린다.
  vi.unstubAllGlobals();
});

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

  // 액션이 reject(네트워크 오류 등)로 던져도 확인창은 닫혀야 한다 — loading 중엔
  // 취소·바깥클릭이 전부 막혀 있어, 여기서 안 닫으면 새로고침 말고는 출구가 없다.
  it('삭제 액션이 throw 해도 확인창이 닫히고 에러 토스트가 뜬다', async () => {
    vi.mocked(deleteSigningTemplateAction).mockRejectedValue(new Error('network down'));
    render(<ContractTemplateList initialTemplates={initialTemplates} />);

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    await screen.findByText('템플릿을 삭제할까요?');
    await userEvent.click(screen.getByRole('button', { name: '삭제할게요' }));

    await waitFor(() =>
      expect(screen.queryByText('템플릿을 삭제할까요?')).not.toBeInTheDocument(),
    );
    expect(toastMock).toHaveBeenCalledWith('삭제하지 못했어요', { type: 'error' });
    // 템플릿은 그대로 남아 있다(삭제되지 않았다).
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

  it('확인창에서 닫기를 누르면 삭제되지 않는다', async () => {
    render(<ContractTemplateList initialTemplates={initialTemplates} />);

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(await screen.findByText('템플릿을 삭제할까요?')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '닫기' }));

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

  // 서버 로드 실패가 빈 배열로 흡수되면 "템플릿이 없어요" 빈 상태로 위장된다 —
  // 사용자는 자기 템플릿이 사라진 줄 안다. 실패는 실패로 보이고 재시도 경로가 있어야 한다.
  it('loadFailed 면 빈 상태 대신 에러 표면과 다시 불러오기를 보여준다', async () => {
    vi.mocked(listSigningTemplatesAction).mockResolvedValue({
      ok: true,
      templates: initialTemplates,
    });
    render(<ContractTemplateList initialTemplates={[]} loadFailed />);

    expect(screen.queryByText('아직 저장한 계약서 템플릿이 없어요')).not.toBeInTheDocument();
    expect(screen.getByText(/목록을 불러오지 못했어요/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));

    expect(await screen.findByText('표준 계약서')).toBeInTheDocument();
    expect(screen.queryByText(/목록을 불러오지 못했어요/)).not.toBeInTheDocument();
  });

  it('다시 불러오기가 또 실패하면 에러 표면이 유지된다', async () => {
    vi.mocked(listSigningTemplatesAction).mockResolvedValue({ ok: false, error: 'UNKNOWN' });
    render(<ContractTemplateList initialTemplates={[]} loadFailed />);

    await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));

    expect(await screen.findByText(/목록을 불러오지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText('아직 저장한 계약서 템플릿이 없어요')).not.toBeInTheDocument();
  });

  // 빈 이름 제출이 조용히 no-op 이면 막다른 길이다 — 왜 안 되는지 그 자리에서 말한다.
  it('빈 이름으로 저장하면 인라인 에러를 보여주고 액션을 부르지 않는다', async () => {
    render(<ContractTemplateList initialTemplates={initialTemplates} />);

    await userEvent.click(screen.getByRole('button', { name: '이름 변경' }));
    await userEvent.clear(screen.getByLabelText('템플릿 이름 변경'));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이름을 입력해 주세요');
    expect(renameSigningTemplateAction).not.toHaveBeenCalled();
    // 폼은 열린 채다 — 사용자가 이어서 고칠 수 있다.
    expect(screen.getByLabelText('템플릿 이름 변경')).toBeInTheDocument();
  });

  it('이름 변경 왕복 동안 저장 버튼이 비활성이라 중복 제출이 막힌다', async () => {
    let resolveRename!: (r: { ok: boolean }) => void;
    vi.mocked(renameSigningTemplateAction).mockReturnValue(
      new Promise((r) => (resolveRename = r)) as never,
    );
    render(<ContractTemplateList initialTemplates={initialTemplates} />);

    await userEvent.click(screen.getByRole('button', { name: '이름 변경' }));
    const input = screen.getByLabelText('템플릿 이름 변경');
    await userEvent.clear(input);
    await userEvent.type(input, '새 이름');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(renameSigningTemplateAction).toHaveBeenCalledTimes(1);

    resolveRename({ ok: true });
    await waitFor(() => expect(screen.getByText('새 이름')).toBeInTheDocument());
  });

  // 서버 zod 상한(80자)을 입력단에서도 지킨다 — 넘겨 적고 저장에서 실패하는 것보다 낫다.
  it('이름 입력은 서버 상한 80자로 제한된다', async () => {
    render(<ContractTemplateList initialTemplates={initialTemplates} />);
    await userEvent.click(screen.getByRole('button', { name: '이름 변경' }));
    expect(screen.getByLabelText('템플릿 이름 변경')).toHaveAttribute('maxLength', '80');
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

// ── 기존 템플릿 열기(확인·수정) ───────────────────────────────────────────
// 목록이 detail 액션 + PDF 프록시 fetch 를 병렬로 프리페치하고, 둘 다 성공했을 때만
// 에디터를 initial 과 함께 마운트한다 — 실패는 목록 위 토스트로 끝나 에디터에
// 로딩/에러 표면을 만들지 않는다.
describe('ContractTemplateList — 기존 템플릿 열기', () => {
  const detailOk = {
    ok: true as const,
    name: '표준 계약서',
    fields: [
      { id: 'f1', type: 'signature' as const, party: 'buyer' as const, pageNumber: 1, x: 1, y: 2, width: 30, height: 20 },
    ],
  };

  it('수정 클릭 → detail + PDF 프리페치 성공 시 에디터가 initial 과 함께 열린다', async () => {
    vi.mocked(getSigningTemplateDetailAction).mockResolvedValue(detailOk);
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    render(<ContractTemplateList initialTemplates={initialTemplates} />);
    await userEvent.click(screen.getByRole('button', { name: '수정' }));

    const editor = await screen.findByTestId('mock-editor');
    expect(getSigningTemplateDetailAction).toHaveBeenCalledWith({ templateId: 't1' });
    expect(fetchSpy).toHaveBeenCalledWith('/api/signing/templates/t1/document');
    expect(editor.dataset.initialTemplate).toBe('t1');
    expect(editor.dataset.initialName).toBe('표준 계약서');
    expect(editor.dataset.initialFields).toBe('1');
    expect(editor.dataset.initialFile).toBe('표준 계약서.pdf');
    expect(editor.dataset.initialBytes).toBe('3');
  });

  it('detail 실패 시 토스트를 띄우고 목록에 머문다', async () => {
    vi.mocked(getSigningTemplateDetailAction).mockResolvedValue({
      ok: false,
      error: 'TEMPLATE_NOT_FOUND',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 200 })));

    render(<ContractTemplateList initialTemplates={initialTemplates} />);
    await userEvent.click(screen.getByRole('button', { name: '수정' }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.stringContaining('계약서 템플릿을 찾을 수 없어요'),
        { type: 'error' },
      ),
    );
    expect(screen.queryByTestId('mock-editor')).not.toBeInTheDocument();
    expect(screen.getByText('표준 계약서')).toBeInTheDocument();
    // 실패 후 버튼이 다시 활성이라 재시도할 수 있다.
    expect(screen.getByRole('button', { name: '수정' })).toBeEnabled();
  });

  it('PDF 프리페치 실패(비 2xx·reject) 시 토스트를 띄우고 목록에 머문다', async () => {
    vi.mocked(getSigningTemplateDetailAction).mockResolvedValue(detailOk);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 502 })));

    render(<ContractTemplateList initialTemplates={initialTemplates} />);
    await userEvent.click(screen.getByRole('button', { name: '수정' }));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith('계약서 PDF를 불러오지 못했어요', { type: 'error' }),
    );
    expect(screen.queryByTestId('mock-editor')).not.toBeInTheDocument();

    // reject(네트워크 단절)도 같은 결말 — 조용한 unhandled rejection 금지.
    toastMock.mockClear();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')));
    await userEvent.click(screen.getByRole('button', { name: '수정' }));
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(screen.queryByTestId('mock-editor')).not.toBeInTheDocument();
  });

  it('수정 저장 완료 → 목록으로 돌아와 서버 목록을 재조회한다', async () => {
    vi.mocked(getSigningTemplateDetailAction).mockResolvedValue(detailOk);
    vi.mocked(listSigningTemplatesAction).mockResolvedValue({
      ok: true,
      templates: [{ ...initialTemplates[0]!, name: '개정판' }],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 })),
    );

    render(<ContractTemplateList initialTemplates={initialTemplates} />);
    await userEvent.click(screen.getByRole('button', { name: '수정' }));
    await screen.findByTestId('mock-editor');
    await userEvent.click(screen.getByRole('button', { name: '완료(mock 저장)' }));

    expect(await screen.findByText('개정판')).toBeInTheDocument();
  });

  // 프리페치 잠금은 수정 버튼만으로는 반쪽이다 — 새 템플릿 만들기·삭제가 열려
  // 있으면 늦게 도착한 setEditorState 가 사용자가 방금 고른 화면을 덮어쓴다
  // (새 템플릿을 눌렀는데 다른 템플릿의 수정 화면이 열린다 — 적대 리뷰).
  it('locks 새 템플릿 만들기 and 삭제 while an edit prefetch is in flight', async () => {
    let resolveDetail!: (v: typeof detailOk) => void;
    vi.mocked(getSigningTemplateDetailAction).mockReturnValue(
      new Promise((res) => {
        resolveDetail = res;
      }) as ReturnType<typeof getSigningTemplateDetailAction>,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 })),
    );

    render(<ContractTemplateList initialTemplates={initialTemplates} />);
    await userEvent.click(screen.getByRole('button', { name: '수정' }));

    expect(screen.getByRole('button', { name: '불러오는 중…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '새 템플릿 만들기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled();

    resolveDetail(detailOk);
    await screen.findByTestId('mock-editor');
  });

  // 프록시가 실어 준 provider 원본 파일명(X-Template-Filename, URI 인코딩)을
  // 쓴다 — 없으면 `${템플릿이름}.pdf` 폴백. 원본 파일명이 있어야 에디터의
  // 같은-PDF 재선택 보존(이름 대조)이 실제로 성립한다.
  it('uses the X-Template-Filename header for the editor fileName when present', async () => {
    vi.mocked(getSigningTemplateDetailAction).mockResolvedValue(detailOk);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'X-Template-Filename': encodeURIComponent('원본 계약서.pdf') },
        }),
      ),
    );

    render(<ContractTemplateList initialTemplates={initialTemplates} />);
    await userEvent.click(screen.getByRole('button', { name: '수정' }));

    const editor = await screen.findByTestId('mock-editor');
    expect(editor.dataset.initialFile).toBe('원본 계약서.pdf');
  });
});
