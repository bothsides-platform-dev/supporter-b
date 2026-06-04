import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// listConversationAttachments는 'use server' 액션 — jsdom에서 실행 불가. mock.
vi.mock('@/lib/server/actions/chat/listConversationAttachments', () => ({
  listConversationAttachments: vi.fn(),
}));

import { listConversationAttachments } from '@/lib/server/actions/chat/listConversationAttachments';
import { AttachmentGalleryPanel } from '../AttachmentGalleryPanel';

const mockList = listConversationAttachments as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AttachmentGalleryPanel', () => {
  it('로딩 중에는 LOADING… 텍스트를 표시한다', async () => {
    // Never resolves — stays loading.
    mockList.mockReturnValue(new Promise(() => {}));

    render(<AttachmentGalleryPanel conversationId="conv-1" />);

    expect(screen.getByText('LOADING…')).toBeDefined();
  });

  it('첨부파일이 없으면 "첨부파일 없음" 텍스트를 표시한다', async () => {
    mockList.mockResolvedValue([]);

    render(<AttachmentGalleryPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText('첨부파일 없음')).toBeDefined();
    });
  });

  it('첨부파일 목록을 렌더한다', async () => {
    mockList.mockResolvedValue([
      { id: 'att-1', name: 'spec.pdf', size: 1024, mimeType: 'application/pdf', url: '/api/files/att-1' },
      { id: 'att-2', name: 'logo.png', size: 512, mimeType: 'image/png', url: '/api/files/att-2' },
    ]);

    render(<AttachmentGalleryPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText('spec.pdf')).toBeDefined();
      expect(screen.getByText('logo.png')).toBeDefined();
    });
  });

  it('conversationId가 바뀌면 새로 조회한다', async () => {
    mockList.mockResolvedValue([]);

    const { rerender } = render(<AttachmentGalleryPanel conversationId="conv-1" />);
    await waitFor(() => expect(mockList).toHaveBeenCalledWith('conv-1'));

    rerender(<AttachmentGalleryPanel conversationId="conv-2" />);
    await waitFor(() => expect(mockList).toHaveBeenCalledWith('conv-2'));
  });
});
