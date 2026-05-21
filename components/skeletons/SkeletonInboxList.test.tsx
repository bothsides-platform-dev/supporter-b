import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SkeletonInboxList } from './SkeletonInboxList'

describe('SkeletonInboxList', () => {
  it('defaults to 5 rows', () => {
    render(<SkeletonInboxList />)
    expect(screen.getAllByTestId('skeleton-inbox-row')).toHaveLength(5)
  })

  it('renders rows number of rows', () => {
    render(<SkeletonInboxList rows={3} />)
    expect(screen.getAllByTestId('skeleton-inbox-row')).toHaveLength(3)
  })
})
