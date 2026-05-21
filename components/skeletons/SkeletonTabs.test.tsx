import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SkeletonTabs } from './SkeletonTabs'

describe('SkeletonTabs', () => {
  it('defaults to 4 tab skeletons', () => {
    render(<SkeletonTabs />)
    expect(screen.getAllByTestId('skeleton-tab')).toHaveLength(4)
  })

  it('renders count number of tabs', () => {
    render(<SkeletonTabs count={3} />)
    expect(screen.getAllByTestId('skeleton-tab')).toHaveLength(3)
  })
})
