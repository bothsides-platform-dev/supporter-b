import { render, screen } from '@testing-library/react'
import { SkeletonRfpDetailHeader } from './SkeletonRfpDetailHeader'

describe('SkeletonRfpDetailHeader', () => {
  it('renders root element', () => {
    render(<SkeletonRfpDetailHeader />)
    expect(screen.getByTestId('skeleton-rfp-detail-header')).toBeTruthy()
  })
})
