import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PgLandingHeaderNav } from './PgLandingHeaderNav'

// force-static PG 랜딩에서는 서버 auth() 대신 클라이언트 훅으로 세션을 조회한다
// (components/landing/use-session-authed.ts) — 이 훅만 모킹하면 충분하다.
vi.mock('@/components/landing/use-session-authed', () => ({
  useSessionAuthed: vi.fn(),
}))

import { useSessionAuthed } from '@/components/landing/use-session-authed'

describe('PgLandingHeaderNav', () => {
  it('shows 로그인 → link when not authenticated', () => {
    vi.mocked(useSessionAuthed).mockReturnValue(false)
    render(<PgLandingHeaderNav />)
    expect(screen.getByRole('link', { name: /로그인/ })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: /앱으로 이동/i })).toBeNull()
  })

  it('shows 앱으로 이동 link when authenticated', () => {
    vi.mocked(useSessionAuthed).mockReturnValue(true)
    render(<PgLandingHeaderNav />)
    expect(screen.getByRole('link', { name: /앱으로 이동/i })).toHaveAttribute('href', '/home')
    expect(screen.queryByRole('link', { name: '로그인 →' })).toBeNull()
  })
})
