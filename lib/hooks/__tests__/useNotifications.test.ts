import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResponsePromise } from 'ky'

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
    } as unknown as ResponsePromise)

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
    } as unknown as ResponsePromise)

    const { renderHook, act } = await import('@testing-library/react')
    const { useNotifications } = await import('@/lib/hooks/useNotifications')
    const { result } = renderHook(() => useNotifications())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.status).toBe('error')
  })
})

describe('useNotifications — workspace switch (Phase 7b 회귀)', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  function makeNotif(id: string, workspaceId: string): unknown {
    return {
      id,
      userId: 'u-1',
      workspaceId,
      type: 'rfp.invited',
      title: id,
      body: 'msg',
      channel: 'inapp',
      status: 'sent',
      createdAt: new Date().toISOString(),
    }
  }

  it('워크스페이스를 전환하면 이전 ws 알림을 버리고 새 ws용으로 다시 로드한다', async () => {
    const { http } = await import('@/lib/http')

    // ws-A: 알림 2개 (unreadCount 2)
    const aList = [makeNotif('a-1', 'ws-A'), makeNotif('a-2', 'ws-A')]
    // ws-B: 알림 1개 (unreadCount 1) — A와 겹치지 않음
    const bList = [makeNotif('b-1', 'ws-B')]

    let calls = 0
    vi.mocked(http.get).mockImplementation(
      () =>
        ({
          json: vi.fn().mockImplementation(async () => {
            calls += 1
            return { notifications: calls === 1 ? aList : bList }
          }),
        }) as unknown as ResponsePromise,
    )

    const { renderHook, act } = await import('@testing-library/react')
    const { useNotifications } = await import('@/lib/hooks/useNotifications')

    // 1) ws-A로 mount
    const { result, rerender } = renderHook(
      ({ wsId }: { wsId: string }) => useNotifications(wsId),
      { initialProps: { wsId: 'ws-A' } },
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.notifications.map((n) => n.id)).toEqual(['a-1', 'a-2'])
    expect(result.current.unreadCount).toBe(2)

    // 2) ws-B로 전환
    act(() => {
      rerender({ wsId: 'ws-B' })
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // 싱글톤이 리셋되어 B용으로 다시 fetch 했어야 한다.
    expect(http.get).toHaveBeenCalledTimes(2)
    // B는 A의 알림을 더 이상 보면 안 된다.
    expect(result.current.notifications.map((n) => n.id)).toEqual(['b-1'])
    expect(result.current.unreadCount).toBe(1)
  })

  it('전환 중 늦게 도착한 이전 ws 응답이 새 ws를 덮어쓰지 않는다 (TOCTOU)', async () => {
    const { http } = await import('@/lib/http')
    const aList = [makeNotif('a-1', 'ws-A'), makeNotif('a-2', 'ws-A')]
    const bList = [makeNotif('b-1', 'ws-B')]

    // 두 fetch 의 resolve 순서를 수동 제어 — A(이전 ws)가 B(새 ws) 보다 늦게 도착.
    let resolveA: (v: { notifications: unknown[] }) => void = () => {}
    let resolveB: (v: { notifications: unknown[] }) => void = () => {}
    const pA = new Promise<{ notifications: unknown[] }>((r) => { resolveA = r })
    const pB = new Promise<{ notifications: unknown[] }>((r) => { resolveB = r })
    let getCalls = 0
    vi.mocked(http.get).mockImplementation(() => {
      getCalls += 1
      const p = getCalls === 1 ? pA : pB
      return { json: () => p } as unknown as ResponsePromise
    })

    const { renderHook, act } = await import('@testing-library/react')
    const { useNotifications } = await import('@/lib/hooks/useNotifications')

    // 1) ws-A mount → fetch #1 (pA) 진행 중, 아직 미해결
    const { result, rerender } = renderHook(
      ({ wsId }: { wsId: string }) => useNotifications(wsId),
      { initialProps: { wsId: 'ws-A' } },
    )

    // 2) 곧바로 ws-B 전환 → reset + fetch #2 (pB)
    act(() => {
      rerender({ wsId: 'ws-B' })
    })

    // 3) B(새 ws)가 먼저 도착
    await act(async () => {
      resolveB({ notifications: bList })
      await Promise.resolve()
    })
    // 4) A(이전 ws)가 뒤늦게 도착 — stale 이므로 store 에 써서는 안 된다
    await act(async () => {
      resolveA({ notifications: aList })
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(result.current.notifications.map((n) => n.id)).toEqual(['b-1'])
    expect(result.current.unreadCount).toBe(1)
  })
})
