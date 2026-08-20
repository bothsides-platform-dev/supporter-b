// 조항형 계약서 에디터 — 미리보기 요청 순서와 blob 수명.
//
// 이 기능이 내세우는 보장은 "**본 대로 서명된다**"이고, 그 근거는 미리보기 바이트가
// 곧 업로드되는 바이트라는 것이다. 그런데 미리보기 요청이 겹쳤을 때 **느린 앞 요청이
// 나중에 도착하면** 화면이 낡은 문서로 되돌아간다 — 보장이 정확히 그 지점에서 깨진다.
// 렌더가 수 MB PDF 라 지연 편차가 커서 드문 경우가 아니다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const saveMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true }) as { ok: boolean; error?: string }),
);
vi.mock('@/lib/server/actions/signing/saveComposedTemplateAction', () => ({
  saveComposedTemplateAction: saveMock,
}));
const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

import { ClauseTemplateEditor } from '../ClauseTemplateEditor';
import { signingErrorMessage } from '@/lib/signing/error-messages';

/** 발급한 object URL 과 revoke 된 것 — blob 수명 단언의 근거. */
let issued: string[] = [];
let revoked: string[] = [];

/** 아직 응답하지 않은 요청들의 resolver — 순서를 시험에서 직접 정한다. */
let pending: Array<(res: Response) => void> = [];

function pdfResponse(marker: string): Response {
  return {
    ok: true,
    status: 200,
    blob: async () => marker as unknown as Blob,
    text: async () => '',
  } as unknown as Response;
}

beforeEach(() => {
  vi.useFakeTimers();
  issued = [];
  revoked = [];
  pending = [];
  let n = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn((blob: unknown) => {
      const url = `blob:${String(blob)}#${(n += 1)}`;
      issued.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => {
      revoked.push(url);
    }),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve))),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** 디바운스를 넘겨 대기 중인 미리보기 요청을 실제로 띄운다. */
async function flushDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
}

function renderEditor() {
  return render(<ClauseTemplateEditor onCancel={() => {}} onSaved={() => {}} />);
}

describe('ClauseTemplateEditor — 미리보기 요청 순서', () => {
  it('느린 앞 요청이 나중에 도착해도 최신 미리보기를 덮지 않는다', async () => {
    renderEditor();
    await flushDebounce();
    expect(pending).toHaveLength(1);

    // 사용자가 계속 편집한다 — 두 번째 요청이 뜬다.
    await act(async () => {
      screen.getByLabelText('제1조 제목').setAttribute('value', 'x');
    });
    const titleInput = screen.getByLabelText('제1조 제목') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(titleInput, '수정된 제목');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flushDebounce();
    expect(pending).toHaveLength(2);

    // 두 번째가 먼저 도착하고 첫 번째가 뒤늦게 도착한다.
    await act(async () => {
      pending[1](pdfResponse('B'));
    });
    const shownAfterB = (screen.getByTitle('계약서 미리보기') as HTMLIFrameElement).src;

    await act(async () => {
      pending[0](pdfResponse('A'));
    });
    const shownAfterLateA = (screen.getByTitle('계약서 미리보기') as HTMLIFrameElement).src;

    // 화면은 **최신(B)** 을 계속 보여야 한다.
    expect(shownAfterLateA).toBe(shownAfterB);
    expect(shownAfterLateA).toContain('B');
    // 그리고 살아 있는 blob 을 회수하면 안 된다 — iframe 이 그 URL 을 쥐고 있다.
    expect(revoked).not.toContain(shownAfterB);
  });

  it('뒤늦게 도착한 취소된 응답의 blob 은 그 자리에서 회수한다', async () => {
    const { unmount } = renderEditor();
    await flushDebounce();
    expect(pending).toHaveLength(1);

    unmount();
    await act(async () => {
      pending[0](pdfResponse('LATE'));
    });

    // 언마운트 정리는 이미 지나갔다 — 늦게 만들어진 URL 을 그 자리에서 놓지 않으면
    // 주인 없는 blob 이 남는다.
    for (const url of issued) expect(revoked).toContain(url);
  });
});

describe('ClauseTemplateEditor — 미리보기 오류', () => {
  it('400 본문을 그대로 보여준다 — 사용자가 방금 만든 문제다', async () => {
    renderEditor();
    await flushDebounce();
    await act(async () => {
      pending[0]({
        ok: false,
        status: 400,
        text: async () => '그릴 수 없는 문자가 있어요: 株',
      } as unknown as Response);
    });

    // `findByText` 는 쓰지 않는다 — 가짜 타이머에서는 waitFor 가 진행되지 않아 멈춘다.
    // 상태 갱신은 위 act 안에서 이미 끝났으므로 동기 조회로 충분하다.
    expect(screen.getByText(/그릴 수 없는 문자가 있어요: 株/)).toBeInTheDocument();
  });
});

describe('ClauseTemplateEditor — 저장', () => {
  it('저장 실패는 코드가 아니라 사용자 문구로 보여준다', async () => {
    saveMock.mockResolvedValue({ ok: false, error: 'COMPOSE_UNSUPPORTED_CHARACTER' });
    renderEditor();

    await act(async () => {
      screen.getByRole('button', { name: '저장' }).click();
    });

    // `signingErrorMessage` 를 지나야 한다 — raw 코드가 그대로 뜨면 사용자가 무엇을
    // 고쳐야 하는지 알 수 없다.
    expect(screen.queryByText('COMPOSE_UNSUPPORTED_CHARACTER')).not.toBeInTheDocument();
    expect(screen.getByText(signingErrorMessage('COMPOSE_UNSUPPORTED_CHARACTER'))).toBeInTheDocument();
  });

  // 저장 왕복 중 화면이 사라질 수 있다 — 그 뒤의 setState·토스트는 사라진 화면에 대고
  // 말하는 것이다.
  it('언마운트 뒤 도착한 저장 결과는 토스트를 띄우지 않는다', async () => {
    let release: (v: { ok: boolean; error?: string }) => void = () => {};
    saveMock.mockImplementation(() => new Promise((res) => (release = res)));
    const { unmount } = renderEditor();

    await act(async () => {
      screen.getByRole('button', { name: '저장' }).click();
    });
    unmount();
    await act(async () => {
      release({ ok: true });
    });

    expect(toastMock).not.toHaveBeenCalled();
  });
});
