import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const uploadAttachment = vi.hoisted(() => vi.fn());
vi.mock('@/lib/attachments/upload-client', () => ({ uploadAttachment }));
vi.mock('@/lib/server/actions/rfp', () => ({
  createRfpAction: vi.fn(),
  verifyDraftFilesAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/toast', () => ({ toast: vi.fn(), toastManager: { close: vi.fn() } }));

import { RfpCreateWizard } from '../RfpCreateWizard';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

describe('랜딩 데모 첨부', () => {
  beforeEach(() => {
    useRfpDraftStore.getState().reset();
    vi.clearAllMocks();
  });

  it('파일을 추가해도 서버 업로드를 호출하지 않는다', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <RfpCreateWizard pgList={[]} guest step={2} onGuestSubmit={vi.fn()} />,
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    await user.upload(fileInput, new File(['pdf bytes'], 'sample.pdf', { type: 'application/pdf' }));

    await waitFor(() => expect(screen.getByText('sample.pdf')).toBeInTheDocument());
    expect(uploadAttachment).not.toHaveBeenCalled();
  });
});
