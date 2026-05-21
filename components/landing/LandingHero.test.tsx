import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { LandingHero } from './LandingHero'

vi.mock('motion/react', () => {
  const makeEl =
    (tag: string) =>
    ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children as React.ReactNode)

  const motion = new Proxy(
    {},
    { get: (_, tag: string) => makeEl(tag) }
  )

  return {
    motion,
    useScroll: () => ({ scrollYProgress: { on: vi.fn() } }),
    useMotionValueEvent: vi.fn(),
  }
})

vi.mock('@/components/landing/SavingsCalculator', () => ({
  SavingsCalculator: () => null,
}))
vi.mock('@/components/landing/LiveBidSimulation', () => ({
  LiveBidSimulation: () => null,
}))
vi.mock('@/components/landing/LandingToast', () => ({
  LandingToast: () => null,
}))

describe('LandingHero header nav', () => {
  it('shows Sign in link when not authenticated', () => {
    render(<LandingHero isAuthenticated={false} />)
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: /앱으로 이동/i })).toBeNull()
  })

  it('shows 앱으로 이동 link when authenticated', () => {
    render(<LandingHero isAuthenticated={true} />)
    expect(screen.getByRole('link', { name: /앱으로 이동/i })).toHaveAttribute('href', '/home')
    expect(screen.queryByRole('link', { name: /sign in/i })).toBeNull()
  })
})
