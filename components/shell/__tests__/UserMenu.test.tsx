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
    vi.mocked(http.post).mockReturnValue({ json: vi.fn().mockResolvedValue({}) } as unknown as ResponsePromise)

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
})
