import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const back = vi.fn();
const forward = vi.fn();
const mockPathname = vi.fn(() => '/home');
const mockSearchParams = vi.fn(() => new URLSearchParams(''));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back, forward }),
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
}));

import { Breadcrumb } from '../Breadcrumb';

beforeEach(() => {
  mockPathname.mockReturnValue('/home');
  mockSearchParams.mockReturnValue(new URLSearchParams(''));
});

afterEach(() => {
  cleanup();
  back.mockClear();
  forward.mockClear();
});

describe('Breadcrumb — URL-derived segments', () => {
  it('derives "RFP / 진행중" from /rfp?status=active', () => {
    mockPathname.mockReturnValue('/rfp');
    mockSearchParams.mockReturnValue(new URLSearchParams('status=active'));
    render(<Breadcrumb />);
    expect(screen.getByText('RFP')).toBeInTheDocument();
    expect(screen.getByText('진행중')).toBeInTheDocument();
  });

  it('derives a single segment for /home', () => {
    mockPathname.mockReturnValue('/home');
    render(<Breadcrumb />);
    expect(screen.getByText('홈')).toBeInTheDocument();
  });

  it('renders no path labels for an unknown route', () => {
    mockPathname.mockReturnValue('/rfp/new');
    render(<Breadcrumb />);
    expect(screen.queryByText('RFP')).not.toBeInTheDocument();
  });
});

describe('Breadcrumb — history navigation', () => {
  it('back button calls router.back()', async () => {
    const user = userEvent.setup();
    render(<Breadcrumb />);
    await user.click(screen.getByRole('button', { name: /뒤로/ }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(forward).not.toHaveBeenCalled();
  });

  it('forward button calls router.forward()', async () => {
    const user = userEvent.setup();
    render(<Breadcrumb />);
    await user.click(screen.getByRole('button', { name: /앞으로/ }));
    expect(forward).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });
});
