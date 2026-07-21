import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SigningSummaryStrip } from '../SigningSummaryStrip';
import type { SigningView } from '@/lib/types/signing';

afterEach(cleanup);

const inProgress: SigningView = {
  contract: {
    id: 'c1',
    rfpId: 'r1',
    status: 'in_progress',
    round: 1,
    createdBy: 'u',
    createdAt: '2026-07-20T04:40:00Z',
  },
  participants: [
    { id: 'b', contractId: 'c1', name: '김구매', email: 'b@x.com', role: 'buyer', securityMethod: 'easy_cert', status: 'signed' },
    { id: 'p', contractId: 'c1', name: '이대행', email: 'p@x.com', role: 'pg', securityMethod: 'email', status: 'pending' },
  ],
};

describe('SigningSummaryStrip', () => {
  it('상태와 서명 수를 보여주고 클릭하면 열림을 알린다', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<SigningSummaryStrip signing={inProgress} side="buyer" onOpen={onOpen} />);
    const strip = screen.getByRole('button', { name: /전자서명/ });
    expect(strip).toHaveTextContent('서명 진행 중');
    expect(strip).toHaveTextContent('1');
    expect(strip).toHaveTextContent('2');
    await user.click(strip);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('진행 중이 아니면 개수를 쓰지 않는다', () => {
    render(
      <SigningSummaryStrip
        signing={{ ...inProgress, contract: { ...inProgress.contract, status: 'completed' } }}
        side="buyer"
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /전자서명/ })).toHaveTextContent('서명 완료');
  });
});
