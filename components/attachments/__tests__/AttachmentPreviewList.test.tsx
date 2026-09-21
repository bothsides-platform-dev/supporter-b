import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Attachment } from '@/lib/types/common';

import { AttachmentPreviewList } from '../AttachmentPreviewList';

const getDocument = vi.hoisted(() => vi.fn());
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument,
}));

const img: Attachment = {
  id: 'a1',
  name: 'logo.png',
  size: 2048,
  mimeType: 'image/png',
  url: '/api/files/a1',
};
const pdf: Attachment = {
  id: 'a2',
  name: 'spec.pdf',
  size: 4096,
  mimeType: 'application/pdf',
  url: '/api/files/a2',
};

describe('AttachmentPreviewList', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    getDocument.mockReset();
  });

  it('shows a clear empty state when there are no files', () => {
    render(<AttachmentPreviewList files={[]} />);
    expect(screen.getByText('첨부파일 없이 견적을 요청했어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('lists each file with its name and a count', () => {
    render(<AttachmentPreviewList files={[img, pdf]} />);
    expect(screen.getByText(/첨부파일/)).toHaveTextContent('첨부파일 (2)');
    expect(screen.getByRole('button', { name: /logo\.png/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /spec\.pdf/ })).toBeInTheDocument();
  });

  it('opens an image in a lightbox preview when its item is clicked', async () => {
    const user = userEvent.setup();
    render(<AttachmentPreviewList files={[img]} />);

    await user.click(screen.getByRole('button', { name: /logo\.png/ }));

    expect(screen.getByAltText('logo.png 미리보기')).toHaveAttribute(
      'src',
      '/api/files/a1',
    );
    expect(screen.getByRole('link', { name: /새 창 열기/ })).toHaveAttribute(
      'href',
      '/api/files/a1',
    );
  });

  it('opens a PDF in an iframe preview when its item is clicked', async () => {
    const user = userEvent.setup();
    render(<AttachmentPreviewList files={[pdf]} />);

    await user.click(screen.getByRole('button', { name: /spec\.pdf/ }));

    const frame = screen.getByTitle('spec.pdf');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', '/api/files/a2');
  });

  it('requests a same-origin PDF preview and draws its first page in the thumbnail', async () => {
    const renderPage = vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() });
    const destroy = vi.fn();
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({ width: 100, height: 140 }),
          render: renderPage,
        }),
      }),
      destroy,
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16),
    } as Response);
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);

    render(<AttachmentPreviewList files={[pdf]} />);

    expect(await screen.findByLabelText('spec.pdf 첫 페이지 미리보기')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/files/a2?preview=1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(getDocument).toHaveBeenCalled();
    expect(renderPage).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
    getContext.mockRestore();
    fetchMock.mockRestore();
  });

  it('keeps a missing PDF downloadable from the preview dialog while showing a thumbnail fallback', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 410 } as Response);
    render(<AttachmentPreviewList files={[pdf]} />);

    expect(await screen.findByText('미리보기 불가')).toBeInTheDocument();
    expect(getDocument).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: /spec\.pdf/ }));
    expect(screen.getByRole('link', { name: /새 창 열기/ })).toHaveAttribute('href', '/api/files/a2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts a pending PDF download when the attachment list unmounts', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    const view = render(<AttachmentPreviewList files={[pdf]} />);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.signal?.aborted).toBe(false);
    view.unmount();
    expect(request?.signal?.aborted).toBe(true);
  });

  it('waits until a PDF thumbnail nears the viewport before downloading it', async () => {
    let reveal: (() => void) | undefined;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        reveal = () => this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      disconnect() {}
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));

    render(<AttachmentPreviewList files={[pdf]} />);
    await vi.waitFor(() => expect(reveal).toBeDefined());
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => reveal?.());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('starts at most two visible PDF downloads at a time', async () => {
    const revealers: Array<() => void> = [];
    vi.stubGlobal('IntersectionObserver', class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        revealers.push(() => this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
      }
      disconnect() {}
    });
    let finishFirst: ((response: Response) => void) | undefined;
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockImplementation(() => new Promise(() => {}));
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({ width: 100, height: 140 }),
          render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        }),
      }),
      destroy: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    const files = [pdf, { ...pdf, id: 'a3', name: 'second.pdf' }, { ...pdf, id: 'a4', name: 'third.pdf' }];

    const view = render(<AttachmentPreviewList files={files} />);
    await vi.waitFor(() => expect(revealers).toHaveLength(3));
    act(() => revealers.forEach((reveal) => reveal()));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    finishFirst?.({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) } as Response);
    await vi.waitFor(() => expect(getDocument).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(screen.getByLabelText('spec.pdf 첫 페이지 미리보기')).toBeInTheDocument());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    view.unmount();
  });

  it('shows FileTextIcon fallback in thumbnail when image load fails', () => {
    render(<AttachmentPreviewList files={[img]} />);

    const thumbImg = screen.getByAltText('logo.png');
    // Trigger React's onError synthetic handler via fireEvent
    fireEvent.error(thumbImg);

    // After onError, the broken <img> should be replaced by a fallback icon
    expect(screen.queryByAltText('logo.png')).toBeNull();
  });
});
