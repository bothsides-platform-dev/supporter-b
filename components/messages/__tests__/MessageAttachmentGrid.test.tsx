// MessageAttachmentGrid — 메시지 버블 내 첨부 그리드. 상대방/팀 채팅 공용.
// 이미지 첨부는 <img> 썸네일, 그 외(PDF 등)는 파일 링크 + 클립 아이콘.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { MessageAttachmentGrid } from '../MessageAttachmentGrid';
import { NEW_TAB_NOTICE } from '@/lib/a11y/link-notice';

afterEach(() => cleanup());

describe('MessageAttachmentGrid', () => {
  it('이미지 첨부는 <img> 썸네일로 렌더한다', () => {
    render(
      <MessageAttachmentGrid
        attachments={[
          { id: 'img-1', name: '스크린샷.png', mimeType: 'image/png', url: '/api/files/img-1' },
        ]}
      />,
    );
    const link = screen.getByRole('link', { name: /스크린샷.png/ });
    expect(link).toHaveAttribute('href', '/api/files/img-1');
    const img = link.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', '/api/files/img-1');
  });

  it('이미지가 아닌 첨부는 <img> 없이 파일 링크만 렌더한다', () => {
    render(
      <MessageAttachmentGrid
        attachments={[
          { id: 'pdf-1', name: '명세.pdf', mimeType: 'application/pdf', url: '/api/files/pdf-1' },
        ]}
      />,
    );
    const link = screen.getByRole('link', { name: /명세.pdf/ });
    expect(link).toHaveAttribute('href', '/api/files/pdf-1');
    expect(link.querySelector('img')).toBeNull();
  });

  it('새 탭으로 열린다는 사실을 접근성 이름에 싣는다', () => {
    // 아이콘·썸네일은 aria-hidden 이거나 파일명을 되풀이할 뿐이라, target="_blank" 로
    // 맥락이 바뀐다는 사실이 스크린리더에 전달되지 않았다.
    render(
      <MessageAttachmentGrid
        attachments={[
          { id: 'pdf-1', name: '명세.pdf', mimeType: 'application/pdf', url: '/api/files/pdf-1' },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: new RegExp(NEW_TAB_NOTICE) })).toHaveAttribute(
      'target',
      '_blank',
    );
    expect(screen.getByText(NEW_TAB_NOTICE)).toHaveClass('sr-only');
  });

  it('여러 첨부를 모두 렌더한다', () => {
    render(
      <MessageAttachmentGrid
        attachments={[
          { id: 'a', name: 'a.pdf', mimeType: 'application/pdf', url: '/api/files/a' },
          { id: 'b', name: 'b.png', mimeType: 'image/png', url: '/api/files/b' },
        ]}
      />,
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});
