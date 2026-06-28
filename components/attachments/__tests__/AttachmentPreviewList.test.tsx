import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Attachment } from '@/lib/types/common';

import { AttachmentPreviewList } from '../AttachmentPreviewList';

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
  afterEach(() => cleanup());

  it('renders nothing when there are no files', () => {
    const { container } = render(<AttachmentPreviewList files={[]} />);
    expect(container).toBeEmptyDOMElement();
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

  it('shows FileTextIcon fallback in thumbnail when image load fails', () => {
    render(<AttachmentPreviewList files={[img]} />);

    const thumbImg = screen.getByAltText('logo.png');
    // Trigger React's onError synthetic handler via fireEvent
    fireEvent.error(thumbImg);

    // After onError, the broken <img> should be replaced by a fallback icon
    expect(screen.queryByAltText('logo.png')).toBeNull();
  });
});
