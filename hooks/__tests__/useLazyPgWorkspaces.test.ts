import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/http', () => ({
  http: { get: vi.fn() },
}))
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('use http client')))

import { http } from '@/lib/http'
import type { ResponsePromise } from 'ky'
import { useLazyPgWorkspaces } from '@/hooks/useLazyPgWorkspaces'

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('useLazyPgWorkspaces', () => {
  it('load 호출 시 http.get으로 PG 워크스페이스 조회 후 pgList 갱신', async () => {
    const workspaces = [{ id: 'ws-1', name: 'toss', displayName: '토스페이먼츠' }]
    vi.mocked(http.get).mockReturnValue({
      json: vi.fn().mockResolvedValue({ workspaces }),
    } as unknown as ResponsePromise)

    const { result } = renderHook(() => useLazyPgWorkspaces())
    await act(() => result.current.load())

    expect(http.get).toHaveBeenCalledWith('/api/workspaces/search', {
      searchParams: { type: 'pg' },
    })
    expect(result.current.pgList).toEqual(workspaces)
    expect(result.current.error).toBeNull()
  })

  it('요청 실패 시 error 상태 설정 및 재시도 허용', async () => {
    vi.mocked(http.get).mockReturnValue({
      json: vi.fn().mockRejectedValue(new Error('network error')),
    } as unknown as ResponsePromise)

    const { result } = renderHook(() => useLazyPgWorkspaces())
    await act(() => result.current.load())

    expect(result.current.error).toBe('불러오기 실패. 다시 시도해주세요.')
    expect(result.current.pgList).toEqual([])
  })
})
