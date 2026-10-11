import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { GuestAttachments } from '../GuestAttachments';
import { GuestSession } from '../useGuestDraft';
import { createGuestDraft, loadGuestDraft } from '@/lib/guest-rfp/draft';
import { guestFiles } from '@/lib/guest-rfp/files';
vi.mock('@/lib/guest-rfp/files', () => ({
  guestFiles: { put: vi.fn(), remove: vi.fn() },
}));
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
it('persists failed attachment metadata before IDB writes and offers retry/removal', async () => {
  const session = new GuestSession(createGuestDraft(), () => {});
  session.save();
  const onError = vi.fn();
  vi.mocked(guestFiles.put)
    .mockRejectedValueOnce(new DOMException('quota', 'QuotaExceededError'))
    .mockResolvedValueOnce('ok');
  function Harness() {
    const [busy, setBusy] = useState(false);
    return (
      <GuestAttachments
        session={session}
        busy={busy}
        setBusy={setBusy}
        onError={onError}
      />
    );
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('견적 요청 첨부 파일'), {
    target: {
      files: [new File(['%PDF'], 'local.pdf', { type: 'application/pdf' })],
    },
  });
  const retry = await screen.findByRole('button', { name: '다시 저장해요' });
  // A reload after the failed write must retain the reference and block submission if bytes are absent.
  expect(loadGuestDraft()?.files.map((f) => f.name)).toEqual(['local.pdf']);
  fireEvent.click(retry);
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: '다시 저장해요' })).toBeNull(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'local.pdf 제거' }));
  await waitFor(() => expect(loadGuestDraft()?.files).toHaveLength(0));
});
