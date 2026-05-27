import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Static mocks — these run before module loading
vi.mock('@/lib/http', () => ({
  http: { get: vi.fn() },
}))
vi.mock('@/lib/server/actions/notifications/markNotificationReadAction', () => ({
  markNotificationReadAction: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('@/lib/server/actions/notifications/markAllReadAction', () => ({
  markAllReadAction: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('@/lib/server/actions/notifications/retryEmailNotificationAction', () => ({
  retryEmailNotificationAction: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('use http client')))

class EventSourceStub {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  close() {}
}
vi.stubGlobal('EventSource', EventSourceStub)

describe('useNotifications — loadHistory', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('성공 시 http.get(/api/notifications)로 히스토리 로드', async () => {
    const notifications = [
      { id: 'n-1', title: '테스트', body: 'msg', read: false, createdAt: new Date().toISOString() },
    ]

    const { http } = await import('@/lib/http')
    vi.mocked(http.get).mockReturnValue({
      json: vi.fn().mockResolvedValue({ notifications }),
    } as any)

    const { renderHook, act } = await import('@testing-library/react')
    const { useNotifications } = await import('@/lib/hooks/useNotifications')

    renderHook(() => useNotifications())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(http.get).toHaveBeenCalledWith('/api/notifications')
  })

  it('요청 실패 시 status를 error로 설정', async () => {
    const { http } = await import('@/lib/http')
    vi.mocked(http.get).mockReturnValue({
      json: vi.fn().mockRejectedValue(new Error('network error')),
    } as any)

    const { renderHook, act } = await import('@testing-library/react')
    const { useNotifications } = await import('@/lib/hooks/useNotifications')
    const { result } = renderHook(() => useNotifications())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.status).toBe('error')
  })
})
