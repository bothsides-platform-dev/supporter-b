import { render, screen } from '@testing-library/react'
import { SkeletonBidForm } from './SkeletonBidForm'

describe('SkeletonBidForm', () => {
  it('renders root element', () => {
    render(<SkeletonBidForm />)
    expect(screen.getByTestId('skeleton-bid-form')).toBeTruthy()
  })
})
