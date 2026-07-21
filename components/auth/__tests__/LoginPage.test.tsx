import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockSearchParams = new URLSearchParams();
// Stable spies so cross-host tests can assert push vs. window.location.assign.
// (Lazily referenced by the factory at module import, after these init.)
const routerPush = vi.fn();
const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/lib/server/actions/auth', () => ({
  loginAction: vi
    .fn()
    .mockResolvedValue({ ok: false, error: 'INVALID_CREDENTIALS' }),
}));

import LoginPage from '@/app/(public)/login/page';
import { loginAction } from '@/lib/server/actions/auth';

const loginActionMock = loginAction as unknown as ReturnType<typeof vi.fn>;

describe('LoginPage — 이메일 프리필', () => {
  beforeEach(() => {
    mockSearchParams.delete('email');
    mockSearchParams.delete('next');
    if (typeof window !== 'undefined') window.localStorage.clear();
  });

  it('?email 파라미터가 없으면 이메일 필드가 비어있다', () => {
    render(<LoginPage />);
    const input = screen.getByLabelText('이메일') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('?email 파라미터가 있으면 이메일 필드에 값이 채워진다', () => {
    mockSearchParams.set('email', 'kim@example.com');
    render(<LoginPage />);
    const input = screen.getByLabelText('이메일') as HTMLInputElement;
    expect(input.value).toBe('kim@example.com');
  });
});

describe('LoginPage — 실패 카운트 / 락 mock', () => {
  beforeEach(() => {
    mockSearchParams.delete('email');
    mockSearchParams.delete('next');
    if (typeof window !== 'undefined') window.localStorage.clear();
  });

  async function failOnce(): Promise<void> {
    const submit = screen.getByRole('button', { name: '로그인' });
    fireEvent.click(submit);
    await waitFor(() => {
      const lockBox = screen.queryByTestId('login-lock');
      if (lockBox) return;
      const err = screen.queryByText(/확인해요|잠겼어요/);
      expect(err).not.toBeNull();
    });
  }

  it('10회 실패 전까지는 락 박스가 노출되지 않는다', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'kim@example.com' },
    });
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'whatever' },
    });

    for (let i = 1; i <= 9; i++) {
      await failOnce();
    }
    expect(screen.queryByTestId('login-lock')).toBeNull();
  });

  it('10회 실패 시 락 박스가 노출되고 버튼이 disabled', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'kim@example.com' },
    });
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'whatever' },
    });
    for (let i = 1; i <= 10; i++) {
      await failOnce();
    }
    expect(screen.getByTestId('login-lock')).toBeDefined();
    expect(
      (screen.getByRole('button', {
        name: '로그인',
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('LoginPage — cross-host 로그인 리다이렉트', () => {
  // Two hosts in prod: support-b.com (buyer) / partner.support-b.com (pg).
  // The (app) shell bounces a session whose home host ≠ the host it logged in on
  // via a server `redirect()` to an absolute cross-origin URL. Reached through a
  // client-side router.push (RSC fetch), the browser blocks that cross-origin
  // redirect as CORS. The login page must therefore do a FULL-PAGE navigation
  // when the home host differs, and a soft router.push only when it matches.
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSearchParams.delete('email');
    mockSearchParams.delete('next');
    if (typeof window !== 'undefined') window.localStorage.clear();
    routerPush.mockReset();
    routerRefresh.mockReset();
    assign = vi.fn();
    // jsdom's window.location.assign throws "not implemented"; replace location
    // with a stub exposing host + assign so a hard navigation can be asserted.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { host: 'partner.support-b.com', assign },
    });
    vi.stubEnv('NEXT_PUBLIC_BUYER_ORIGIN', 'https://support-b.com');
    vi.stubEnv('NEXT_PUBLIC_PARTNER_ORIGIN', 'https://partner.support-b.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function submitLogin() {
    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  }

  it('buyer 워크스페이스 유저가 PG 호스트(partner)에서 로그인하면 buyer 호스트로 전체 페이지 이동한다 (cross-origin redirect CORS 회피)', async () => {
    loginActionMock.mockResolvedValueOnce({
      ok: true,
      email: 'user@example.com',
      workspaceType: 'buyer',
    });

    render(<LoginPage />);
    await submitLogin();

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://support-b.com/home'),
    );
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('pg 워크스페이스 유저가 같은 PG 호스트에서 로그인하면 router.push로 부드럽게 이동한다 (불필요한 전체 새로고침 없음)', async () => {
    loginActionMock.mockResolvedValueOnce({
      ok: true,
      email: 'user@example.com',
      workspaceType: 'pg',
    });

    render(<LoginPage />);
    await submitLogin();

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/home'));
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('LoginPage — 서버 LOCKED 응답', () => {
  beforeEach(() => {
    mockSearchParams.delete('email');
    mockSearchParams.delete('next');
    if (typeof window !== 'undefined') window.localStorage.clear();
  });

  it('서버가 LOCKED를 돌려주면 클라 카운터와 무관하게 첫 시도에도 락 박스가 뜨고 버튼이 비활성화된다', async () => {
    const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    loginActionMock.mockResolvedValueOnce({ ok: false, error: 'LOCKED', lockedUntil });

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'kim@example.com' },
    });
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'whatever' },
    });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    // Single failed attempt — the client localStorage counter is at 1, nowhere
    // near the threshold. The lock must come from the server response.
    await waitFor(() => {
      expect(screen.getByTestId('login-lock')).toBeDefined();
    });
    expect(
      (screen.getByRole('button', { name: '로그인' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  // The lock box mixes a label ("남은 시간") with a live countdown. DESIGN.md §3
  // puts the label on .md-label-small and the VALUE on .md-numeric (mono +
  // tabular-nums) so the digits don't jitter as the timer ticks down. Pin the
  // split so a future refactor can't collapse them back into one mono blob.
  it('락 박스의 남은 시간 수치는 .md-numeric 으로 분리 렌더된다', async () => {
    const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    loginActionMock.mockResolvedValueOnce({ ok: false, error: 'LOCKED', lockedUntil });

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'kim@example.com' },
    });
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'whatever' },
    });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    const lockBox = await screen.findByTestId('login-lock');
    // Label text survives the span split (matcher must ignore element bounds).
    expect(lockBox.textContent).toMatch(/남은 시간\s*\d{1,2}:\d{2}/);

    const numeric = lockBox.querySelector('.md-numeric');
    expect(numeric).not.toBeNull();
    expect(numeric?.textContent).toMatch(/^\d{1,2}:\d{2}$/);
    // The label itself must NOT be inside the numeric carve-out.
    expect(numeric?.textContent).not.toContain('남은 시간');
  });
});
