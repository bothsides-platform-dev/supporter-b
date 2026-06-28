import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toastMock(...a) }));

import { CopyButton } from '../CopyButton';

afterEach(() => { cleanup(); toastMock.mockReset(); });

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('CopyButton', () => {
  it('클릭하면 값을 클립보드에 복사하고 성공 토스트를 띄운다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<CopyButton value="sales@toss.im" label="이메일" />);
    fireEvent.click(screen.getByRole('button', { name: '이메일 복사' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('sales@toss.im'));
    expect(toastMock).toHaveBeenCalledWith('복사했어요', { type: 'success' });
  });

  it('복사가 실패하면 오류 토스트를 띄운다', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('nope')));
    render(<CopyButton value="x" label="전화" />);
    fireEvent.click(screen.getByRole('button', { name: '전화 복사' }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith('복사하지 못했어요', { type: 'error' }));
  });
});
