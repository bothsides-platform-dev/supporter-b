import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const back = vi.fn();
const forward = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back, forward }),
}));

import { Breadcrumb } from '../Breadcrumb';

afterEach(() => {
  cleanup();
  back.mockClear();
  forward.mockClear();
});

describe('Breadcrumb', () => {
  it('renders segments joined by a separator', () => {
    render(<Breadcrumb segments={['RFP', '진행중']} />);
    expect(screen.getByText('RFP')).toBeInTheDocument();
    expect(screen.getByText('진행중')).toBeInTheDocument();
  });

  it('renders a single segment without separator', () => {
    render(<Breadcrumb segments={['홈']} />);
    expect(screen.getByText('홈')).toBeInTheDocument();
  });

  it('back button calls router.back()', async () => {
    const user = userEvent.setup();
    render(<Breadcrumb segments={['RFP']} />);
    await user.click(screen.getByRole('button', { name: /뒤로/ }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(forward).not.toHaveBeenCalled();
  });

  it('forward button calls router.forward()', async () => {
    const user = userEvent.setup();
    render(<Breadcrumb segments={['RFP']} />);
    await user.click(screen.getByRole('button', { name: /앞으로/ }));
    expect(forward).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });
});
