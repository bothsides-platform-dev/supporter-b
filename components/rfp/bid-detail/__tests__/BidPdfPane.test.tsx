import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BidPdfPane } from '../BidPdfPane';

describe('BidPdfPane', () => {
  it('PDF 가 없으면 큰 미리보기 높이를 잡지 않고 한 줄 안내만 보여준다', () => {
    const { container } = render(<BidPdfPane />);
    expect(screen.getByText('견적서 미첨부')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/min-h-\[/);
  });

  it('PDF 가 있으면 미리보기 높이를 확보한다', () => {
    const { container } = render(
      <BidPdfPane pdf={{ id: 'a', name: 'proposal.pdf', url: '/api/files/a' } as never} />,
    );
    expect(screen.getByTitle('proposal.pdf')).toBeInTheDocument();
    expect(container.innerHTML).toMatch(/min-h-\[400px\]/);
  });
});
