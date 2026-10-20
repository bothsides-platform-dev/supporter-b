import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let nextQuery = '';
const mockPush = vi.fn();
const mockTrackFunnel = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics/funnel', () => ({ trackFunnel: mockTrackFunnel }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(nextQuery),
}));

const mockCheckEmail = vi.fn();
vi.mock('@/lib/server/actions/auth', () => ({
  checkEmailAvailableAction: (...args: unknown[]) => mockCheckEmail(...args),
}));

vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => ({}),
  writeSignupDraft: vi.fn(),
}));

vi.mock('@/lib/stores/signup-draft', () => ({
  useSignupDraftStore: () => ({
    setEmail: vi.fn(),
    setAgreedAt: vi.fn(),
    setWorkspaceType: vi.fn(),
  }),
}));

import BuyerSignupEmailPage from '../page';

beforeEach(() => {
  nextQuery = '';
  mockPush.mockReset();
  mockCheckEmail.mockReset();
  mockTrackFunnel.mockClear();
});

afterEach(() => cleanup());

describe('BuyerSignupEmailPage — 이메일 blur 중복 검사', () => {
  it('유효한 이메일 blur 시 checkEmailAvailableAction을 호출한다', async () => {
    mockCheckEmail.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<BuyerSignupEmailPage />);

    await user.type(screen.getByLabelText('이메일'), 'test@example.com');
    await user.tab();

    await waitFor(() => {
      expect(mockCheckEmail).toHaveBeenCalledWith({ email: 'test@example.com' });
    });
  });

  it('취득 이메일 blur 시 "이미 가입된 이메일입니다." 에러를 노출한다', async () => {
    mockCheckEmail.mockResolvedValue({ ok: false, error: 'EMAIL_TAKEN' });
    const user = userEvent.setup();
    render(<BuyerSignupEmailPage />);

    await user.type(screen.getByLabelText('이메일'), 'taken@example.com');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/이미 가입된 이메일입니다/)).toBeInTheDocument();
    });
  });

  it('마스터/운영자 이메일 blur 시 "가입할 수 없어요" 안내를 노출한다', async () => {
    mockCheckEmail.mockResolvedValue({ ok: false, error: 'MASTER_EMAIL' });
    const user = userEvent.setup();
    render(<BuyerSignupEmailPage />);

    await user.type(screen.getByLabelText('이메일'), 'op@support-b.com');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/이 이메일로는 가입할 수 없어요/)).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('유효하지 않은 이메일 포맷 blur 시 checkEmailAvailableAction을 호출하지 않는다', async () => {
    const user = userEvent.setup();
    render(<BuyerSignupEmailPage />);

    await user.type(screen.getByLabelText('이메일'), 'not-an-email');
    await user.tab();

    await new Promise((r) => setTimeout(r, 30));
    expect(mockCheckEmail).not.toHaveBeenCalled();
  });

  it('이메일 수정 시 취득 에러가 즉시 사라진다', async () => {
    mockCheckEmail.mockResolvedValue({ ok: false, error: 'EMAIL_TAKEN' });
    const user = userEvent.setup();
    render(<BuyerSignupEmailPage />);

    await user.type(screen.getByLabelText('이메일'), 'taken@example.com');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/이미 가입된 이메일입니다/)).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText('이메일'));
    expect(screen.queryByText(/이미 가입된 이메일입니다/)).not.toBeInTheDocument();
  });

  it('취득 이메일 상태에서 다음 클릭 시 에러가 유지되고 페이지 이동이 없다', async () => {
    mockCheckEmail.mockResolvedValue({ ok: false, error: 'EMAIL_TAKEN' });
    const user = userEvent.setup();
    render(<BuyerSignupEmailPage />);

    await user.type(screen.getByLabelText('이메일'), 'taken@example.com');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/이미 가입된 이메일입니다/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByText(/이미 가입된 이메일입니다/)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('BuyerSignupEmailPage — 회사 이메일 권장 안내', () => {
  it('입력 전에는 중립 힌트를 보여준다', () => {
    render(<BuyerSignupEmailPage />);
    expect(screen.getByText('회사 이메일을 입력해주세요')).toBeInTheDocument();
  });

  it('무료 도메인 입력 시 개인 이메일 경고로 전환한다', async () => {
    const user = userEvent.setup();
    render(<BuyerSignupEmailPage />);

    await user.type(screen.getByLabelText('이메일'), 'kim@gmail.com');

    expect(screen.getByText(/별도 심사 과정이 추가될 수 있어요/)).toBeInTheDocument();
  });

  it('취득 이메일 에러가 표시되면 안내를 숨긴다', async () => {
    mockCheckEmail.mockResolvedValue({ ok: false, error: 'EMAIL_TAKEN' });
    const user = userEvent.setup();
    render(<BuyerSignupEmailPage />);

    await user.type(screen.getByLabelText('이메일'), 'taken@gmail.com');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/이미 가입된 이메일입니다/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/별도 심사 과정이 추가될 수 있어요/)).not.toBeInTheDocument();
  });

  it('마스터/운영자 이메일 에러가 표시되면 안내를 숨긴다', async () => {
    mockCheckEmail.mockResolvedValue({ ok: false, error: 'MASTER_EMAIL' });
    const user = userEvent.setup();
    render(<BuyerSignupEmailPage />);

    await user.type(screen.getByLabelText('이메일'), 'op@gmail.com');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/이 이메일로는 가입할 수 없어요/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/별도 심사 과정이 추가될 수 있어요/)).not.toBeInTheDocument();
    expect(screen.queryByText('회사 이메일을 입력해주세요')).not.toBeInTheDocument();
  });
});

it.each(['/rfp-create?resume=guest', 'https://evil.example', '//evil.example'])('preserves only safe next in both login links: %s', async (next) => {
  nextQuery = new URLSearchParams({ next }).toString();
  mockCheckEmail.mockResolvedValue({ ok: false, error: 'EMAIL_TAKEN' });
  const user = userEvent.setup();
  render(<BuyerSignupEmailPage />);
  const suffix = next.startsWith('/rfp-create') ? '?next=%2Frfp-create%3Fresume%3Dguest' : '';
  expect(screen.getByRole('link', { name: '이미 계정이 있어요? 로그인 →' })).toHaveAttribute('href', '/login' + suffix);
  await user.type(screen.getByLabelText('이메일'), 'Taken@example.com');
  await user.tab();
  const duplicateLink = await screen.findByRole('link', { name: '로그인' });
  const url = new URL(duplicateLink.getAttribute('href')!, 'https://support-b.com');
  expect(url.pathname).toBe('/login');
  expect(url.searchParams.get('email')).toBe('taken@example.com');
  expect(url.searchParams.get('next')).toBe(suffix ? '/rfp-create?resume=guest' : null);
});

it.each(['footer', 'duplicate-email'])('records guest login choice through the %s link without email contents', async (source) => {
  nextQuery = new URLSearchParams({ next: '/rfp-create?resume=guest' }).toString();
  mockCheckEmail.mockResolvedValue({ ok: false, error: 'EMAIL_TAKEN' });
  const user = userEvent.setup();
  render(<BuyerSignupEmailPage />);
  if (source === 'duplicate-email') {
    await user.type(screen.getByLabelText('이메일'), 'taken@example.com');
    await user.tab();
    await screen.findByRole('link', { name: '로그인' });
  }
  mockTrackFunnel.mockClear();
  await user.click(screen.getByRole('link', {
    name: source === 'footer' ? '이미 계정이 있어요? 로그인 →' : '로그인',
  }));
  expect(mockTrackFunnel.mock.calls).toEqual([[
    'funnel_cta_click',
    { funnel_id: 'acquisition', step_id: 'choose_login', entry_path: 'guest' },
  ]]);
});

it.each(['', '/home', 'https://evil.example/rfp-create?resume=guest'])('does not label ordinary signup login as a guest quote: %s', async (next) => {
  nextQuery = new URLSearchParams({ next }).toString();
  const user = userEvent.setup();
  render(<BuyerSignupEmailPage />);
  mockTrackFunnel.mockClear();
  await user.click(screen.getByRole('link', { name: '이미 계정이 있어요? 로그인 →' }));
  expect(mockTrackFunnel).not.toHaveBeenCalled();
});
