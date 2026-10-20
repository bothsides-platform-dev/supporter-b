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
  return { motion, useScroll: () => ({ scrollYProgress: { on: vi.fn() } }), useMotionValueEvent: vi.fn(), useTransform: () => 1, useInView: () => true, useReducedMotion: () => false }
})

vi.mock('./LandingHeroSection', () => ({ LandingHeroSection: ({ partners }: { partners?: React.ReactNode }) => <>{partners}</> }))
vi.mock('./FadeInView', () => ({
  FadeInView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/landing/SavingsCalculator', () => ({ SavingsCalculator: () => null }))
vi.mock('@/components/landing/SolutionShowcase', () => ({ SolutionShowcase: () => null }))
vi.mock('@/components/landing/demo-app/DemoAppShell', () => ({ DemoAppShell: () => null }))
vi.mock('@/components/landing/FaqList', () => ({ FaqList: () => null }))

vi.mock('@/lib/stores/theme', () => ({
  useThemeStore: (selector: (s: { resolvedTheme: string; setTheme: (t: string) => void }) => unknown) =>
    selector({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))

describe('LandingHero', () => {
  it('provides the three partner brands to the buyer hero only', () => {
    render(<LandingHero />)
    expect(screen.getByRole('region', { name: '제휴 PG사' })).toBeInTheDocument()
    for (const name of ['토스페이먼츠', '키움페이', '헥토파이낸셜']) {
      expect(screen.getAllByRole('img', { name })).toHaveLength(1)
    }
  })
  it('renders whatever is passed as nav prop', () => {
    render(<LandingHero nav={<a href="/test">Test Nav</a>} />)
    expect(screen.getByRole('link', { name: 'Test Nav' })).toHaveAttribute('href', '/test')
  })

  it('routes the final CTA in the contact section to /rfp-create', () => {
    render(<LandingHero />)
    const cta = screen.getByRole('link', { name: /PG견적 무료로 받기/ })
    expect(cta).toHaveAttribute('href', '/quote-start')
  })

  it('offers Channel Talk in a separate consultation section', async () => {
    const channelIO = vi.fn()
    window.ChannelIO = channelIO as unknown as typeof window.ChannelIO
    const { container } = render(<LandingHero />)
    const contact = container.querySelector('#consultation') as HTMLElement
    expect(contact).toHaveTextContent('PG 수수료 협의나 가입 심사가 막막한가요?')
    screen.getByRole('button', { name: /채팅으로 문의해요/ }).click()
    expect(channelIO).toHaveBeenCalledWith('showMessenger')
  })

  it('shows the three PoC metrics', () => {
    render(<LandingHero />)
    const values = [...document.querySelectorAll('[data-metric-value]')].map((el) => el.textContent)
    expect(values).toEqual(['0.89%', '4.5주', '2300만원'])
    expect(screen.getByText('업종과 거래 규모에 따라 결과는 달라질 수 있어요.')).toBeInTheDocument()
  })

  it('states 2026 free pricing with a future-paid notice', () => {
    render(<LandingHero />)
    expect(screen.getByText(/2026년\) 무료로 이용/)).toBeInTheDocument()
    expect(screen.getByText(/한분기 전에 공유드릴 예정/)).toBeInTheDocument()
  })

  it('anchors the pricing, calculator, faq and contact sections', () => {
    const { container } = render(<LandingHero />)
    for (const id of ['service', 'pricing', 'calculator', 'faq', 'contact']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
  })

  it('labels the demo/process section with a heading and intro', () => {
    render(<LandingHero />)
    expect(screen.getByText('실제 화면을 미리 둘러보세요')).toBeInTheDocument()
    expect(screen.getByText(/직접 둘러보세요/)).toBeInTheDocument()
  })
})
