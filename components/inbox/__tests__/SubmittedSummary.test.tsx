import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubmittedSummary } from '../SubmittedSummary';

afterEach(cleanup);

const rows: [string, string][] = [
  ['정산 주기', 'D+1'],
  ['정산한도', '₩1,000,000'],
];

describe('SubmittedSummary', () => {
  it('기본은 접혀 있어 값이 보이지 않는다', () => {
    render(<SubmittedSummary rows={rows} />);
    expect(screen.queryByText('D+1')).not.toBeInTheDocument();
  });

  it('"보낸 내용 보기" 클릭 시 펼쳐진다', async () => {
    const user = userEvent.setup();
    render(<SubmittedSummary rows={rows} />);
    await user.click(screen.getByRole('button', { name: /보낸 내용 보기/ }));
    expect(screen.getByText('D+1')).toBeInTheDocument();
  });
});
