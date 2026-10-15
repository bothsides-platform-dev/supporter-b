import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { GuestAttachments } from '../GuestAttachments';
import { GuestSession } from '../useGuestDraft';
import { createGuestDraft, loadGuestDraft } from '@/lib/guest-rfp/draft';
import { guestFiles } from '@/lib/guest-rfp/files';
vi.mock('@/lib/guest-rfp/files', () => ({
  guestFiles: { put: vi.fn(), get: vi.fn().mockResolvedValue(undefined), remove: vi.fn() },
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
  const retry = await screen.findByRole('button', { name: 'local.pdf 다시 저장' });
  expect(retry.closest('[data-file-row]')).toHaveTextContent('원본을 보관하지 못했어요');
  // A reload after the failed write must retain the reference and block submission if bytes are absent.
  expect(loadGuestDraft()?.files.map((f) => f.name)).toEqual(['local.pdf']);
  fireEvent.click(retry);
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'local.pdf 다시 저장' })).toBeNull(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'local.pdf 제거' }));
  await waitFor(() => expect(loadGuestDraft()?.files).toHaveLength(0));
});

it('shows a recovery path beside a restored file with no original and highlights an active drop', async () => {
  const draft = createGuestDraft();
  draft.files = [{ id: 'missing', name: 'missing.pdf', size: 2048, type: 'application/pdf' }];
  const session = new GuestSession(draft, () => {});
  session.save();
  render(<GuestAttachments session={session} busy={false} setBusy={() => {}} onError={() => {}} />);
  const message = await screen.findByText('원본을 찾지 못했어요. 파일을 제거한 뒤 다시 선택해요.');
  expect(message.closest('[data-file-row]')).toHaveTextContent('PDF');
  expect(message.closest('[data-file-row]')).toHaveTextContent('2 KB');
  expect(screen.getByRole('button', { name: 'missing.pdf 제거' })).toHaveTextContent('제거');
  expect(screen.queryByRole('button', { name: '첨부 다시 저장해요' })).not.toBeInTheDocument();
  const drop = screen.getByLabelText('견적 요청 첨부 파일').closest('label')!;
  fireEvent.dragEnter(drop);
  expect(drop).toHaveAttribute('data-dragging', 'true');
  fireEvent.dragLeave(drop);
  expect(drop).toHaveAttribute('data-dragging', 'false');
});
