import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MAX_ARCHIVE_DOC_BYTES } from '@/lib/contract-archive/limits';

const uploadMock = vi.fn<(f: File, m: unknown) => Promise<{ id: string }>>();
vi.mock('@/lib/contract-archive/upload-client', () => ({
  uploadContractArchive: (f: File, m: unknown) => uploadMock(f, m),
}));

const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (m: string, o?: unknown) => toastMock(m, o) }));

vi.mock('@/lib/observability/capture', () => ({ captureActionError: vi.fn() }));

import { ContractArchiveUploadDialog } from '../ContractArchiveUploadDialog';

function pdf(name = '계약서.pdf', size = 1024): File {
  const f = new File(['%PDF-1.7'], name, { type: 'application/pdf' });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

/**
 * ⚠️ 이 다이얼로그 안에서는 `userEvent.type` 이 **키를 잃는다** — Base-UI Dialog 의
 * 포커스 트랩이 일부 키(공백 포함)를 가로채, '내가 적은 제목' 이 '내가' 로 잘린다.
 * 단독 실행에서는 통과하고 파일 전체 실행에서만 재현돼 플레이크로 오인하기 쉽다.
 * 이 레포의 처방대로 텍스트 입력은 `fireEvent.change` 로 한 번에 넣는다.
 */
function setText(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value } });
}

const onClose = vi.fn();
const onUploaded = vi.fn();

function open() {
  return render(
    <ContractArchiveUploadDialog open onClose={onClose} onUploaded={onUploaded} />,
  );
}

beforeEach(() => {
  uploadMock.mockReset();
  uploadMock.mockResolvedValue({ id: 'a1' });
  toastMock.mockReset();
  onClose.mockReset();
  onUploaded.mockReset();
});
afterEach(cleanup);

describe('ContractArchiveUploadDialog', () => {
  it('파일과 제목이 없으면 보관할 수 없다', () => {
    open();
    expect(screen.getByRole('button', { name: '보관하기' })).toHaveProperty('disabled', true);
  });

  // 제목은 필수인데 매번 타이핑시키면 마찰이다 — 파일명에서 확장자를 떼 채워 준다.
  it('파일을 고르면 제목을 파일명으로 채워 준다 (비어 있을 때만)', async () => {
    const user = userEvent.setup();
    open();
    await user.upload(screen.getByLabelText(/PDF 파일/), pdf('결제대행 계약.pdf'));

    expect(screen.getByLabelText(/제목/)).toHaveProperty('value', '결제대행 계약');
    expect(screen.getByRole('button', { name: '보관하기' })).toHaveProperty('disabled', false);
  });

  it('이미 적은 제목은 파일 선택이 덮어쓰지 않는다', async () => {
    const user = userEvent.setup();
    open();
    setText(screen.getByLabelText(/제목/), '내가 적은 제목');
    await user.upload(screen.getByLabelText(/PDF 파일/), pdf('다른이름.pdf'));

    expect(screen.getByLabelText(/제목/)).toHaveProperty('value', '내가 적은 제목');
  });

  // 서버가 진짜 경계지만(complete 가 실바이트를 스니핑), 왕복 전에 거르는 편이 낫다.
  it('상한을 넘는 파일은 고르지 않고 이유를 알린다', async () => {
    const user = userEvent.setup();
    open();
    await user.upload(screen.getByLabelText(/PDF 파일/), pdf('큰파일.pdf', MAX_ARCHIVE_DOC_BYTES + 1));

    expect(toastMock).toHaveBeenCalledWith(
      expect.stringContaining('MB까지'),
      expect.objectContaining({ type: 'error' }),
    );
    expect(screen.getByRole('button', { name: '보관하기' })).toHaveProperty('disabled', true);
  });

  it('메타를 함께 보내고 성공하면 onUploaded 를 부른다', async () => {
    const user = userEvent.setup();
    open();
    await user.upload(screen.getByLabelText(/PDF 파일/), pdf());
    setText(screen.getByLabelText(/제목/), '결제대행 계약');
    setText(screen.getByLabelText('상대방'), 'OO페이');
    await user.click(screen.getByRole('button', { name: '보관하기' }));

    await waitFor(() =>
      expect(uploadMock).toHaveBeenCalledWith(
        expect.any(File),
        expect.objectContaining({ title: '결제대행 계약', counterpartyName: 'OO페이' }),
      ),
    );
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
  });

  // 업로드 중 닫으면 presign 된 행이 complete 를 못 받고 pending 으로 남는다
  // (1h 뒤 sweep 이 치우지만 사용자는 "올렸는데 없다"를 겪는다).
  it('업로드 중에는 닫기로 닫히지 않는다', async () => {
    const user = userEvent.setup();
    let release!: (v: { id: string }) => void;
    uploadMock.mockReturnValue(new Promise((res) => { release = res; }));
    open();
    await user.upload(screen.getByLabelText(/PDF 파일/), pdf());
    await user.click(screen.getByRole('button', { name: '보관하기' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '올리는 중…' })).toBeTruthy());
    // 다이얼로그에는 `닫기` 가 둘이다 — 헤더의 X 와 푸터 버튼. 둘 다 같은 `close()`
    // 를 지나므로 어느 쪽이든 busy 중에는 막혀야 한다. 푸터 쪽(마지막)을 누른다.
    const closers = screen.getAllByRole('button', { name: '닫기' });
    await user.click(closers[closers.length - 1]);
    expect(onClose).not.toHaveBeenCalled();

    release({ id: 'a1' });
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
  });

  // 실패 코드마다 사용자가 취할 행동이 다르다 — 한 문구로 뭉뚱그리지 않는다.
  it('서버 오류코드를 사용자 문구로 옮긴다', async () => {
    const user = userEvent.setup();
    uploadMock.mockRejectedValue(new Error('UPLOAD_LIMIT'));
    open();
    await user.upload(screen.getByLabelText(/PDF 파일/), pdf());
    await user.click(screen.getByRole('button', { name: '보관하기' }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.stringContaining('오래된 것을 지우고'),
        expect.objectContaining({ type: 'error' }),
      ),
    );
    // 실패해도 다이얼로그는 열린 채 남는다 — 사용자가 고쳐 다시 시도할 수 있어야 한다.
    expect(onUploaded).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '보관하기' })).toBeTruthy();
  });
});
