// 1단계는 서버에서도 렌더된다(루트 레이아웃의 auth() 가 라우트를 동적으로 만든다). 서버에는
// sessionStorage 가 없어 빈 폼이 그려지므로, draft 복원이 첫 클라이언트 렌더에 끼어들면
// 하이드레이션이 어긋난다. 서버 HTML 위에 hydrateRoot 해서 경고 없이 복원되는지 본다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/server/actions/auth', () => ({
  checkEmailAvailableAction: vi.fn(),
}));

let onServer = false;
const draft = {
  workspaceType: 'buyer',
  email: 'back@example.com',
  password: 'Qa!pass12345',
  agreedAt: '2026-09-23T00:00:00.000Z',
};
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => (onServer ? {} : draft),
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

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('BuyerSignupEmailPage — 서버 렌더 후 draft 복원', () => {
  it('하이드레이션 경고 없이 이메일·필수 동의를 복원하고 비밀번호는 다시 입력받는다', async () => {
    onServer = true;
    const html = renderToString(<BuyerSignupEmailPage />);
    onServer = false;

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const errors: string[] = [];
    const recoverable: unknown[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.map(String).join(' '));
    });

    await act(async () => {
      root = hydrateRoot(container, <BuyerSignupEmailPage />, {
        onRecoverableError: (e) => recoverable.push(e),
      });
    });

    expect(recoverable).toEqual([]);
    expect(errors.filter((e) => /hydrat/i.test(e))).toEqual([]);
    expect(container.querySelector<HTMLInputElement>('#email')?.value).toBe('back@example.com');
    expect(container.querySelector<HTMLInputElement>('#terms')?.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>('#privacy')?.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[name=password]')?.value).toBe('');
  });
});
