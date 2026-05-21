import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SkeletonBriefPanel } from './SkeletonBriefPanel'

describe('SkeletonBriefPanel', () => {
  it('renders root element', () => {
    render(<SkeletonBriefPanel />)
    expect(screen.getByTestId('skeleton-brief-panel')).toBeTruthy()
  })
})
