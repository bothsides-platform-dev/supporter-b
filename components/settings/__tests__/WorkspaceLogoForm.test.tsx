import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const refresh = vi.fn();
const fetchMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

// Replace global fetch
beforeEach(() => {
  global.fetch = fetchMock;
  toast.mockReset();
  fetchMock.mockReset();
  refresh.mockReset();
});

afterEach(() => {
  cleanup();
});

import { ERROR_LABELS, WorkspaceLogoForm } from '../WorkspaceLogoForm';

// 이 라우트(app/api/workspace/[id]/avatar)가 돌려줄 수 있는 코드 전부.
// 새 코드가 라우트에 생기면 여기에 추가해야 하고, 라벨이 없으면 아래 테스트가 깨진다.
const ROUTE_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'FORBIDDEN_NOT_ADMIN',
  'INVALID_MULTIPART',
  'FILE_REQUIRED',
  'EMPTY_FILE',
  'FILE_TOO_LARGE',
  'MIME_NOT_ALLOWED',
  'MIME_MISMATCH',
] as const;

const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makePngFile(name = 'avatar.png', sizeBytes = 100): File {
  const buf = new Uint8Array(sizeBytes);
  buf.set(PNG_HEAD);
  return new File([buf], name, { type: 'image/png' });
}

describe('WorkspaceLogoForm', () => {
  // 같은 패널의 다른 두 폼(WorkspaceNameForm·WorkspaceBizNoForm)은 v0.4.34.0 에서
  // 내부 코드 노출을 없앴는데 이 폼만 `json.error` 를 그대로 토스트에 띄우고 있었다.
  // admin 게이트가 새 코드(FORBIDDEN_NOT_ADMIN)를 도달 가능하게 만들면서 드러났다.
  it('라우트가 돌려줄 수 있는 코드에는 전부 라벨이 있다', () => {
    const unlabeled = ROUTE_ERROR_CODES.filter((c) => !ERROR_LABELS[c]);
    expect(unlabeled).toEqual([]);
  });

  it('업로드 실패 시 내부 코드 대신 한국어 문구를 보여준다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, error: 'FORBIDDEN_NOT_ADMIN' }),
    });

    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt={null} canEdit />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makePngFile());

    await waitFor(() => expect(toast).toHaveBeenCalled());
    const msg = String(toast.mock.calls[0][0]);
    expect(msg).not.toContain('FORBIDDEN_NOT_ADMIN');
    expect(msg).toContain('권한이 없어요');
  });

  it('삭제 실패 시에도 내부 코드를 노출하지 않는다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, error: 'FORBIDDEN_NOT_ADMIN' }),
    });

    render(
      <WorkspaceLogoForm
        workspaceId="ws-1"
        name="구매사"
        logoUpdatedAt="2026-01-01T00:00:00.000Z"
        canEdit
      />,
    );
    await user.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(String(toast.mock.calls[0][0])).not.toContain('FORBIDDEN_NOT_ADMIN');
  });

  // 서버가 admin 게이트로 거부하므로, 누르면 반드시 실패하는 컨트롤을 그리지 않는다.
  // 로고 자체는 계속 보인다 — 읽기는 누구나 할 수 있다.
  it('일반 멤버(canEdit=false)에게는 변경·삭제 컨트롤을 보이지 않는다', () => {
    render(
      <WorkspaceLogoForm
        workspaceId="ws-1"
        name="구매사"
        logoUpdatedAt="2026-01-01T00:00:00.000Z"
        canEdit={false}
      />,
    );
    expect(screen.queryByRole('button', { name: '사진 변경' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
    // 파일 입력까지 없어야 한다 — 버튼만 가리면 input 과 onChange 핸들러가 DOM 에
    // 남아 "누르면 반드시 실패하는 컨트롤은 그리지 않는다"는 계약이 절반만 지켜진다.
    expect(document.querySelector('input[type="file"]')).toBeNull();
    // 아바타(읽기)는 그대로 보인다.
    expect(screen.getByRole('img', { name: '구매사' })).toBeInTheDocument();
  });

  it('renders 사진 변경 button', () => {
    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt={null} canEdit />);
    expect(screen.getByRole('button', { name: '사진 변경' })).toBeInTheDocument();
  });

  it('shows workspace name initial in avatar when no logo', () => {
    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt={null} canEdit />);
    expect(screen.getByRole('img', { name: '구매사' })).toBeInTheDocument();
  });

  it('does not render 삭제 button when logoUpdatedAt is null', () => {
    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt={null} canEdit />);
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });

  it('renders 삭제 button when logoUpdatedAt is set', () => {
    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt="2026-01-01T00:00:00.000Z" canEdit />);
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('rejects file larger than 5MB without calling fetch, shows toast error', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt={null} canEdit />);

    const bigBuf = new Uint8Array(5 * 1024 * 1024 + 1);
    bigBuf.set(PNG_HEAD);
    const bigFile = new File([bigBuf], 'big.png', { type: 'image/png' });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, bigFile);

    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.any(String), { type: 'error' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects non-image file without calling fetch, shows toast error', async () => {
    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt={null} canEdit />);

    const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'doc.pdf', {
      type: 'application/pdf',
    });

    // Use fireEvent to bypass browser accept attribute filtering in jsdom
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [pdfFile], configurable: true });
    fireEvent.change(input);

    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.any(String), { type: 'error' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('calls POST on valid file, then refreshes and shows success toast', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt={null} canEdit />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makePngFile());

    expect(fetchMock).toHaveBeenCalledWith('/api/workspace/ws-1/avatar', expect.objectContaining({ method: 'POST' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.any(String)));
  });

  it('calls DELETE when 삭제 clicked, then refreshes and shows success toast', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt="2026-01-01T00:00:00.000Z" canEdit />);
    await user.click(screen.getByRole('button', { name: '삭제' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/workspace/ws-1/avatar', expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.any(String)));
  });

  it('shows error toast (no inline alert) when upload fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'FILE_TOO_LARGE' }) });

    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt={null} canEdit />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makePngFile());

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.any(String), { type: 'error' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});
