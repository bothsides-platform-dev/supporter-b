import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/http', () => ({
  http: { post: vi.fn() },
}))

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
  it('로그아웃 클릭 시 keepalive fetch POST 호출 후 /login 이동', async () => {
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignMock },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))

    const user = userEvent.setup()
    render(
      <UserMenu
        user={{ name: '홍길동', email: 'test@test.com' }}
        workspaceType="buyer"
      />,
    )

    await user.click(screen.getByRole('button', { name: /사용자 메뉴/ }))
    await user.click(await screen.findByText('로그아웃'))

    expect(fetch).toHaveBeenCalledWith('/logout', expect.objectContaining({ method: 'POST', keepalive: true }))
    expect(assignMock).toHaveBeenCalledWith('/login')
  })

  it('POST가 resolve되지 않아도 클릭 즉시 /login 으로 이동한다 (fire-and-forget)', async () => {
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignMock },
    })
    // fetch가 절대 resolve/reject되지 않는 상황 — await하면 assign이 영원히 호출 안 됨
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))

    const user = userEvent.setup()
    render(
      <UserMenu
        user={{ name: '홍길동', email: 'test@test.com' }}
        workspaceType="buyer"
      />,
    )

    await user.click(screen.getByRole('button', { name: /사용자 메뉴/ }))
    await user.click(await screen.findByText('로그아웃'))

    // fetch 완료를 기다리지 않고 즉시 /login 으로 이동해야 한다
    expect(assignMock).toHaveBeenCalledWith('/login')
  })

  it('fetch POST 실패해도 /login 으로 이동한다', async () => {
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignMock },
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const user = userEvent.setup()
    render(
      <UserMenu
        user={{ name: '홍길동', email: 'test@test.com' }}
        workspaceType="buyer"
      />,
    )

    await user.click(screen.getByRole('button', { name: /사용자 메뉴/ }))
    await user.click(await screen.findByText('로그아웃'))

    // fetch가 실패해도 assign은 즉시 실행됐으므로 호출됨
    expect(assignMock).toHaveBeenCalledWith('/login')
  })
})
