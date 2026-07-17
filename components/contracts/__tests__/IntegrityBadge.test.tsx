import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/server/actions/contract', () => ({
  verifyContractDocAction: vi.fn(),
}));

import { verifyContractDocAction } from '@/lib/server/actions/contract';
import { IntegrityBadge } from '../IntegrityBadge';

const mockVerify = vi.mocked(verifyContractDocAction);

afterEach(() => {
  cleanup();
  mockVerify.mockReset();
});

describe('IntegrityBadge', () => {
  it('마운트 시 1회 자동으로 verifyContractDocAction({docId})을 호출한다', async () => {
    mockVerify.mockResolvedValue({ ok: true, intact: true, computed: 'abc' });
    render(<IntegrityBadge docId="doc-1" />);
    await waitFor(() => expect(mockVerify).toHaveBeenCalledWith({ docId: 'doc-1' }));
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });

  it('intact:true → "위변조 없음" 칩을 렌더한다', async () => {
    mockVerify.mockResolvedValue({ ok: true, intact: true, computed: 'abc' });
    render(<IntegrityBadge docId="doc-1" />);
    expect(await screen.findByText('위변조 없음')).toBeInTheDocument();
  });

  it('intact:false → "검증 실패" + "다시 확인" 버튼을 렌더한다', async () => {
    mockVerify.mockResolvedValue({ ok: true, intact: false, computed: 'abc' });
    render(<IntegrityBadge docId="doc-1" />);
    expect(await screen.findByText('검증 실패')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 확인' })).toBeInTheDocument();
  });

  it('액션 자체가 실패(ok:false)해도 "검증 실패"로 표시한다', async () => {
    mockVerify.mockResolvedValue({ ok: false, error: 'FORBIDDEN' });
    render(<IntegrityBadge docId="doc-1" />);
    expect(await screen.findByText('검증 실패')).toBeInTheDocument();
  });

  it('"다시 확인" 클릭 시 재호출한다', async () => {
    const user = userEvent.setup();
    mockVerify.mockResolvedValue({ ok: true, intact: false, computed: 'abc' });
    render(<IntegrityBadge docId="doc-1" />);
    await screen.findByRole('button', { name: '다시 확인' });
    await user.click(screen.getByRole('button', { name: '다시 확인' }));
    await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(2));
  });
});
