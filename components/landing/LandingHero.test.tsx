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
  const motion = new Proxy({}, { get: (_, tag: string) => makeEl(tag) })
  return { motion, useScroll: () => ({ scrollYProgress: { on: vi.fn() } }), useMotionValueEvent: vi.fn(), useInView: () => true }
})

vi.mock('./LandingHeroSection', () => ({ LandingHeroSection: () => null }))
vi.mock('./FadeInView', () => ({
  FadeInView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/landing/SavingsCalculator', () => ({ SavingsCalculator: () => null }))
vi.mock('@/components/landing/SolutionShowcase', () => ({ SolutionShowcase: () => null }))
vi.mock('@/components/landing/ProcessSection', () => ({ ProcessSection: () => null }))
vi.mock('@/components/landing/FaqList', () => ({ FaqList: () => null }))

vi.mock('@/lib/stores/theme', () => ({
  useThemeStore: (selector: (s: { resolvedTheme: string; setTheme: (t: string) => void }) => unknown) =>
    selector({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))

describe('LandingHero', () => {
  it('renders whatever is passed as nav prop', () => {
    render(<LandingHero nav={<a href="/test">Test Nav</a>} />)
    expect(screen.getByRole('link', { name: 'Test Nav' })).toHaveAttribute('href', '/test')
  })

  it('routes the final CTA in the contact section to /rfp/new', () => {
    render(<LandingHero />)
    const cta = screen.getByRole('link', { name: /PG견적 무료로 받기/ })
    expect(cta).toHaveAttribute('href', '/rfp/new')
  })

  it('shows the three PoC metrics', () => {
    render(<LandingHero />)
    expect(screen.getByText('0.89%')).toBeInTheDocument()
    expect(screen.getByText('4.5주')).toBeInTheDocument()
    expect(screen.getByText('2300만원')).toBeInTheDocument()
  })

  it('states 2026 free pricing with a future-paid notice', () => {
    render(<LandingHero />)
    expect(screen.getByText(/2026년\) 무료로 이용/)).toBeInTheDocument()
    expect(screen.getByText(/2달 전 사전 공유/)).toBeInTheDocument()
  })

  it('anchors the pricing, calculator, faq and contact sections', () => {
    const { container } = render(<LandingHero />)
    for (const id of ['service', 'pricing', 'calculator', 'faq', 'contact']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
  })

  it('drops the standalone process section heading', () => {
    render(<LandingHero />)
    expect(screen.queryByText('SupporterB 이용 프로세스')).toBeNull()
  })
})
