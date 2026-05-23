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

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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

describe('Breadcrumb — clickable trail', () => {
  it('renders the parent RFP segment as a link to /rfp', () => {
    mockPathname.mockReturnValue('/rfp');
    mockSearchParams.mockReturnValue(new URLSearchParams('status=active'));
    render(<Breadcrumb />);
    expect(screen.getByRole('link', { name: 'RFP' })).toHaveAttribute('href', '/rfp');
  });

  it('renders the current segment as the page (aria-current, not a navigable link)', () => {
    mockPathname.mockReturnValue('/rfp');
    mockSearchParams.mockReturnValue(new URLSearchParams('status=active'));
    render(<Breadcrumb />);
    const current = screen.getByText('진행중');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current).not.toHaveAttribute('href');
  });

  it('marks a single-segment current page with aria-current and no link', () => {
    mockPathname.mockReturnValue('/home');
    render(<Breadcrumb />);
    const current = screen.getByText('홈');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current).not.toHaveAttribute('href');
  });

  it('links the 설정 parent to /settings/profile from a sub-page', () => {
    mockPathname.mockReturnValue('/settings/members');
    render(<Breadcrumb />);
    expect(screen.getByRole('link', { name: '설정' })).toHaveAttribute(
      'href',
      '/settings/profile',
    );
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
