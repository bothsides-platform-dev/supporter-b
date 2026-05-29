import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

afterEach(() => cleanup());

import { ComingSoonDialog } from '../ComingSoonDialog';

describe('ComingSoonDialog', () => {
  it('renders the default 구현중 message and 확인 action when open', () => {
    render(<ComingSoonDialog open onOpenChange={vi.fn()} />);
    expect(screen.getAllByText('구현중입니다').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
  });

  it('calls onOpenChange(false) when 확인 is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ComingSoonDialog open onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: '확인' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders nothing visible when closed', () => {
    render(<ComingSoonDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '확인' })).not.toBeInTheDocument();
  });
});
