import { render, screen } from '@testing-library/react'
import { SkeletonTableRows } from './SkeletonTableRows'

describe('SkeletonTableRows', () => {
  it('defaults to 5 rows', () => {
    render(<SkeletonTableRows />)
    expect(screen.getAllByTestId('skeleton-table-row')).toHaveLength(5)
  })

  it('renders rows number of rows', () => {
    render(<SkeletonTableRows rows={3} />)
    expect(screen.getAllByTestId('skeleton-table-row')).toHaveLength(3)
  })

  it('renders chip in last column when hasChip is true', () => {
    render(<SkeletonTableRows rows={2} hasChip />)
    expect(screen.getAllByTestId('skeleton-table-chip')).toHaveLength(2)
  })

  it('does not render chip when hasChip is false', () => {
    render(<SkeletonTableRows rows={2} />)
    expect(screen.queryAllByTestId('skeleton-table-chip')).toHaveLength(0)
  })
})
