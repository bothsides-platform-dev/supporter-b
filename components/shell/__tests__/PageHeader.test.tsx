import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../PageHeader';

describe('PageHeader', () => {
  it('renders the title', () => {
    render(<PageHeader title="RFP 목록" />);
    expect(screen.getByRole('heading', { name: 'RFP 목록' })).toBeInTheDocument();
  });

  it('renders a count chip when count is provided', () => {
    render(<PageHeader title="진행중" count={7} />);
    // count should be visible
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('does not render a count chip when count is not provided', () => {
    render(<PageHeader title="진행중" />);
    expect(screen.queryByTestId('page-header-count')).not.toBeInTheDocument();
  });

  it('renders the action slot when provided', () => {
    render(<PageHeader title="RFP" action={<button>새 RFP</button>} />);
    expect(screen.getByRole('button', { name: '새 RFP' })).toBeInTheDocument();
  });

  it('does not render the action slot when not provided', () => {
    render(<PageHeader title="RFP" />);
    expect(screen.queryByTestId('page-header-action')).not.toBeInTheDocument();
  });
});
