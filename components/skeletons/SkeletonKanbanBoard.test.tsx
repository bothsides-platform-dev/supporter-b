import { render, screen } from '@testing-library/react'
import { SkeletonKanbanBoard } from './SkeletonKanbanBoard'

describe('SkeletonKanbanBoard', () => {
  it('defaults to 6 columns', () => {
    render(<SkeletonKanbanBoard />)
    expect(screen.getAllByTestId('skeleton-kanban-col')).toHaveLength(6)
  })

  it('renders cols number of columns', () => {
    render(<SkeletonKanbanBoard cols={3} />)
    expect(screen.getAllByTestId('skeleton-kanban-col')).toHaveLength(3)
  })

  it('renders cardsPerCol cards per column', () => {
    render(<SkeletonKanbanBoard cols={2} cardsPerCol={2} />)
    expect(screen.getAllByTestId('skeleton-kanban-card')).toHaveLength(4)
  })

  it('defaults to 3 cards per column', () => {
    render(<SkeletonKanbanBoard cols={1} />)
    expect(screen.getAllByTestId('skeleton-kanban-card')).toHaveLength(3)
  })
})
