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
import { useNavHistoryStore } from '@/lib/stores/nav-history';

beforeEach(() => {
  mockPathname.mockReturnValue('/home');
  mockSearchParams.mockReturnValue(new URLSearchParams(''));
  useNavHistoryStore.getState().reset();
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
    expect(screen.getByText('견적 요청')).toBeInTheDocument();
    expect(screen.getByText('진행중')).toBeInTheDocument();
  });

  it('derives a single segment for /home', () => {
    mockPathname.mockReturnValue('/home');
    render(<Breadcrumb />);
    expect(screen.getByText('홈')).toBeInTheDocument();
  });

  it('renders no path labels for an unknown route', () => {
    mockPathname.mockReturnValue('/rfp/unknown-path');
    render(<Breadcrumb />);
    expect(screen.queryByText('견적 요청')).not.toBeInTheDocument();
  });

  it('derives "견적 요청 / 새 견적 요청" from /rfp/new', () => {
    mockPathname.mockReturnValue('/rfp/new');
    render(<Breadcrumb />);
    expect(screen.getByText('견적 요청')).toBeInTheDocument();
    expect(screen.getByText('새 견적 요청')).toBeInTheDocument();
  });
});

describe('Breadcrumb — /rfp/new trail', () => {
  it('renders "견적 요청" as a link to /rfp', () => {
    mockPathname.mockReturnValue('/rfp/new');
    render(<Breadcrumb />);
    expect(screen.getByRole('link', { name: '견적 요청' })).toHaveAttribute('href', '/rfp');
  });

  it('renders "새 견적 요청" as the current page (aria-current, no link)', () => {
    mockPathname.mockReturnValue('/rfp/new');
    render(<Breadcrumb />);
    const current = screen.getByText('새 견적 요청');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current).not.toHaveAttribute('href');
  });
});

describe('Breadcrumb — clickable trail', () => {
  it('renders the parent RFP segment as a link to /rfp', () => {
    mockPathname.mockReturnValue('/rfp');
    mockSearchParams.mockReturnValue(new URLSearchParams('status=active'));
    render(<Breadcrumb />);
    expect(screen.getByRole('link', { name: '견적 요청' })).toHaveAttribute('href', '/rfp');
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
  // Seed an in-app stack with somewhere to go both ways: index 1 of 3.
  const seedMidStack = () =>
    useNavHistoryStore.setState({ entries: ['/a', '/b', '/c'], index: 1, pendingDir: 0 });

  it('back button calls router.back() and marks the back intent', async () => {
    seedMidStack();
    const user = userEvent.setup();
    render(<Breadcrumb />);
    await user.click(screen.getByRole('button', { name: /뒤로/ }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(forward).not.toHaveBeenCalled();
    expect(useNavHistoryStore.getState().pendingDir).toBe(-1);
  });

  it('forward button calls router.forward() and marks the forward intent', async () => {
    seedMidStack();
    const user = userEvent.setup();
    render(<Breadcrumb />);
    await user.click(screen.getByRole('button', { name: /앞으로/ }));
    expect(forward).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    expect(useNavHistoryStore.getState().pendingDir).toBe(1);
  });

  it('disables the back button when there is no in-app history to go back to', () => {
    useNavHistoryStore.setState({ entries: ['/home'], index: 0, pendingDir: 0 });
    render(<Breadcrumb />);
    expect(screen.getByRole('button', { name: /뒤로/ })).toBeDisabled();
  });

  it('disables the forward button at the tip of the in-app history', () => {
    useNavHistoryStore.setState({ entries: ['/a', '/b'], index: 1, pendingDir: 0 });
    render(<Breadcrumb />);
    expect(screen.getByRole('button', { name: /앞으로/ })).toBeDisabled();
  });

  it('enables the back button once there is a previous in-app page', () => {
    useNavHistoryStore.setState({ entries: ['/a', '/b'], index: 1, pendingDir: 0 });
    render(<Breadcrumb />);
    expect(screen.getByRole('button', { name: /뒤로/ })).toBeEnabled();
  });
});
