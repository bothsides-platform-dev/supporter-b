import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { LandingHero } from './LandingHero'

vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children as React.ReactNode)
    El.displayName = `motion.${tag}`
    return El
  }

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

vi.mock('@/lib/stores/theme', () => ({
  useThemeStore: (selector: (s: { resolvedTheme: string; setTheme: (t: string) => void }) => unknown) =>
    selector({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))

describe('LandingHero nav slot', () => {
  it('renders whatever is passed as nav prop', () => {
    render(<LandingHero nav={<a href="/test">Test Nav</a>} />)
    expect(screen.getByRole('link', { name: 'Test Nav' })).toHaveAttribute('href', '/test')
  })

  it('renders nothing in nav area when nav prop is omitted', () => {
    render(<LandingHero />)
    expect(screen.queryByRole('link', { name: 'Test Nav' })).toBeNull()
  })

})
