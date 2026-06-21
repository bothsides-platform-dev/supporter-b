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

import { WorkspaceLogoForm } from '../WorkspaceLogoForm';

const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makePngFile(name = 'avatar.png', sizeBytes = 100): File {
  const buf = new Uint8Array(sizeBytes);
  buf.set(PNG_HEAD);
  return new File([buf], name, { type: 'image/png' });
}

describe('WorkspaceLogoForm', () => {
  it('renders 사진 변경 button', () => {
    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt={null} />);
    expect(screen.getByRole('button', { name: '사진 변경' })).toBeInTheDocument();
  });

  it('shows workspace name initial in avatar when no logo', () => {
    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt={null} />);
    expect(screen.getByRole('img', { name: '구매사' })).toBeInTheDocument();
  });

  it('does not render 삭제 button when logoUpdatedAt is null', () => {
    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt={null} />);
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });

  it('renders 삭제 button when logoUpdatedAt is set', () => {
    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt="2026-01-01T00:00:00.000Z" />);
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('rejects file larger than 5MB without calling fetch, shows toast error', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt={null} />);

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
    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt={null} />);

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

    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt={null} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makePngFile());

    expect(fetchMock).toHaveBeenCalledWith('/api/workspace/ws-1/avatar', expect.objectContaining({ method: 'POST' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.any(String)));
  });

  it('calls DELETE when 삭제 clicked, then refreshes and shows success toast', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt="2026-01-01T00:00:00.000Z" />);
    await user.click(screen.getByRole('button', { name: '삭제' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/workspace/ws-1/avatar', expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.any(String)));
  });

  it('shows error toast (no inline alert) when upload fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'FILE_TOO_LARGE' }) });

    render(<WorkspaceLogoForm workspaceId="ws-1" name="구매사" logoUpdatedAt={null} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makePngFile());

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.any(String), { type: 'error' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});
