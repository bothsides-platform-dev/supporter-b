import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));
const refresh = vi.fn();
const fetchMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  global.fetch = fetchMock;
  toast.mockReset();
  fetchMock.mockReset();
  refresh.mockReset();
});
afterEach(() => cleanup());

import { UserAvatarForm } from '../UserAvatarForm';

const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function makePngFile(): File {
  const buf = new Uint8Array(100);
  buf.set(PNG_HEAD);
  return new File([buf], 'avatar.png', { type: 'image/png' });
}

describe('UserAvatarForm', () => {
  it('renders 사진 변경 button', () => {
    render(<UserAvatarForm userId="u-1" name="홍길동" avatarUpdatedAt={null} />);
    expect(screen.getByRole('button', { name: '사진 변경' })).toBeInTheDocument();
  });

  it('does not render 삭제 button when avatarUpdatedAt is null', () => {
    render(<UserAvatarForm userId="u-1" name="홍길동" avatarUpdatedAt={null} />);
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });

  it('renders 삭제 button when avatarUpdatedAt is set', () => {
    render(<UserAvatarForm userId="u-1" name="홍길동" avatarUpdatedAt="2026-06-21T00:00:00.000Z" />);
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('POSTs to /api/user/avatar on valid file, then refreshes', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<UserAvatarForm userId="u-1" name="홍길동" avatarUpdatedAt={null} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makePngFile());
    expect(fetchMock).toHaveBeenCalledWith('/api/user/avatar', expect.objectContaining({ method: 'POST' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('DELETEs to /api/user/avatar when 삭제 clicked', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<UserAvatarForm userId="u-1" name="홍길동" avatarUpdatedAt="2026-06-21T00:00:00.000Z" />);
    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/user/avatar', expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
