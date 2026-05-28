import { afterEach, describe, expect, it, vi } from 'vitest'

describe('http 인스턴스', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('401 afterResponse hook', () => {
    it('401 응답 시 window.location.assign(/login) 호출', async () => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { assign: vi.fn() },
      })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('', { status: 401 })),
      )

      const { http } = await import('@/lib/http')
      await expect(http.get('http://localhost/test').json()).rejects.toThrow()

      expect(window.location.assign).toHaveBeenCalledWith('/login')
    })

    it('200 응답 시 window.location.assign 미호출', async () => {
      const assignMock = vi.fn()
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { assign: assignMock },
      })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      )

      const { http } = await import('@/lib/http')
      await http.get('http://localhost/test').json()

      expect(assignMock).not.toHaveBeenCalled()
    })
  })
})
