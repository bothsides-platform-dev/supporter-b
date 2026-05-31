import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LandingHeaderNav } from './LandingHeaderNav'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

import { auth } from '@/auth'

describe('LandingHeaderNav', () => {
  it('shows Sign in link when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    render(await LandingHeaderNav())
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: /앱으로 이동/i })).toBeNull()
  })

  it('shows 앱으로 이동 link when authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: '1' } } as never)
    render(await LandingHeaderNav())
    expect(screen.getByRole('link', { name: /앱으로 이동/i })).toHaveAttribute('href', '/home')
    expect(screen.queryByRole('link', { name: /sign in/i })).toBeNull()
  })

  describe('cross-link to the other audience', () => {
    it('on buyer landing (default variant), shows PG entry link → /pg when unauthenticated', async () => {
      vi.mocked(auth).mockResolvedValue(null as never)
      render(await LandingHeaderNav())
      const link = screen.getByRole('link', { name: /PG사 영업담당이신가요/i })
      expect(link).toHaveAttribute('href', '/pg')
    })

    it('on PG landing (variant="pg"), shows buyer entry link → / when unauthenticated', async () => {
      vi.mocked(auth).mockResolvedValue(null as never)
      render(await LandingHeaderNav({ variant: 'pg' }))
      const link = screen.getByRole('link', { name: /구매사이신가요/i })
      expect(link).toHaveAttribute('href', '/')
      expect(screen.queryByRole('link', { name: /PG사 영업담당이신가요/i })).toBeNull()
    })

    it('hides cross-link entirely when authenticated', async () => {
      vi.mocked(auth).mockResolvedValue({ user: { id: '1' } } as never)
      render(await LandingHeaderNav())
      expect(screen.queryByRole('link', { name: /PG사 영업담당이신가요/i })).toBeNull()
      expect(screen.queryByRole('link', { name: /구매사이신가요/i })).toBeNull()
    })
  })
})
