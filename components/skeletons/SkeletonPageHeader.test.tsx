import { render, screen } from '@testing-library/react'
import { SkeletonPageHeader } from './SkeletonPageHeader'

describe('SkeletonPageHeader', () => {
  it('renders title skeleton', () => {
    render(<SkeletonPageHeader />)
    expect(document.querySelector('[data-slot="skeleton"]')).toBeTruthy()
  })

  it('renders action button when hasAction is true', () => {
    render(<SkeletonPageHeader hasAction />)
    expect(screen.getByTestId('skeleton-page-header-action')).toBeTruthy()
  })

  it('does not render action button when hasAction is false', () => {
    render(<SkeletonPageHeader />)
    expect(screen.queryByTestId('skeleton-page-header-action')).toBeNull()
  })
})
