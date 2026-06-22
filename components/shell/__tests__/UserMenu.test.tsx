import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { UserMenu } from '../UserMenu'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('UserMenu 로그아웃', () => {
  it('로그아웃 클릭 시 /logout 으로 GET navigate한다 (쿠키 제거+리다이렉트 단일 왕복)', async () => {
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignMock },
    })

    const user = userEvent.setup()
    render(
      <UserMenu
        user={{ id: 'u-1', name: '홍길동', email: 'test@test.com', avatarUpdatedAt: null }}
        workspaceType="buyer"
      />,
    )

    await user.click(screen.getByRole('button', { name: /사용자 메뉴/ }))
    await user.click(await screen.findByText('로그아웃'))

    expect(assignMock).toHaveBeenCalledWith('/logout')
  })

  it('로그아웃 클릭 시 fetch POST를 호출하지 않는다', async () => {
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignMock },
    })
    vi.stubGlobal('fetch', vi.fn())

    const user = userEvent.setup()
    render(
      <UserMenu
        user={{ id: 'u-1', name: '홍길동', email: 'test@test.com', avatarUpdatedAt: null }}
        workspaceType="buyer"
      />,
    )

    await user.click(screen.getByRole('button', { name: /사용자 메뉴/ }))
    await user.click(await screen.findByText('로그아웃'))

    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('UserMenu avatar', () => {
  it('renders the user photo in the trigger when avatarUpdatedAt is set', () => {
    render(
      <UserMenu
        user={{ id: 'u-9', name: '김담당', email: 'k@k.com', avatarUpdatedAt: '2026-06-21T00:00:00.000Z' }}
        workspaceType="buyer"
      />,
    );
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', `/api/user/u-9/avatar?v=${Date.parse('2026-06-21T00:00:00.000Z')}`);
  });

  it('renders initials when avatarUpdatedAt is null', () => {
    render(
      <UserMenu
        user={{ id: 'u-9', name: '김담당', email: 'k@k.com', avatarUpdatedAt: null }}
        workspaceType="buyer"
      />,
    );
    expect(screen.queryByRole('img')).toBeNull();
  });
});
