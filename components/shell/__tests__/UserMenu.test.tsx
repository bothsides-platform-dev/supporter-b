import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/http', () => ({
  http: { post: vi.fn() },
}))
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('use http client')))

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { http } from '@/lib/http'
import type { ResponsePromise } from 'ky'
import { UserMenu } from '../UserMenu'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('UserMenu 로그아웃', () => {
  it('로그아웃 클릭 시 http.post(/logout) 호출 후 /login 이동', async () => {
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignMock },
    })
    vi.mocked(http.post).mockReturnValue(Promise.resolve({}) as unknown as ResponsePromise)

    const user = userEvent.setup()
    render(
      <UserMenu
        user={{ name: '홍길동', email: 'test@test.com' }}
        workspaceType="buyer"
      />,
    )

    await user.click(screen.getByRole('button', { name: /사용자 메뉴/ }))
    await user.click(await screen.findByText('로그아웃'))

    expect(http.post).toHaveBeenCalledWith('/logout')
    expect(assignMock).toHaveBeenCalledWith('/login')
  })

  it('POST가 resolve되지 않아도 클릭 즉시 /login 으로 이동한다 (fire-and-forget)', async () => {
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignMock },
    })
    // POST가 절대 resolve/reject되지 않는 상황 — await하면 assign이 영원히 호출 안 됨
    vi.mocked(http.post).mockReturnValue(new Promise(() => {}) as unknown as ResponsePromise)

    const user = userEvent.setup()
    render(
      <UserMenu
        user={{ name: '홍길동', email: 'test@test.com' }}
        workspaceType="buyer"
      />,
    )

    await user.click(screen.getByRole('button', { name: /사용자 메뉴/ }))
    await user.click(await screen.findByText('로그아웃'))

    // POST 완료를 기다리지 않고 즉시 /login 으로 이동해야 한다
    expect(assignMock).toHaveBeenCalledWith('/login')
  })

  it('http.post(/logout) 실패해도 /login 으로 이동한다 (try/finally 보장)', async () => {
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignMock },
    })
    // 서버 오류로 POST가 reject되는 상황 — mockImplementation으로 지연 생성해야
    // 미처리 거부 경고 없이 처리된다
    vi.mocked(http.post).mockImplementation(
      () => Promise.reject(new Error('500 Internal Server Error')) as unknown as ResponsePromise,
    )

    const user = userEvent.setup()
    render(
      <UserMenu
        user={{ name: '홍길동', email: 'test@test.com' }}
        workspaceType="buyer"
      />,
    )

    await user.click(screen.getByRole('button', { name: /사용자 메뉴/ }))
    await user.click(await screen.findByText('로그아웃'))

    // POST가 실패해도 finally 블록이 반드시 실행되어 /login 으로 이동해야 한다
    expect(assignMock).toHaveBeenCalledWith('/login')
  })
})
