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

  it('renders the description when provided', () => {
    render(<PageHeader title="견적 템플릿" description="자주 쓰는 정산조건을 저장해 둬요." />);
    expect(screen.getByText('자주 쓰는 정산조건을 저장해 둬요.')).toBeInTheDocument();
  });

  it('does not render a description when not provided', () => {
    render(<PageHeader title="견적 템플릿" />);
    expect(screen.queryByTestId('page-header-description')).not.toBeInTheDocument();
  });

  // 기존 호출부(/inbox·/rfp·/messages·/notifications·/opportunities)는 description 을
  // 넘기지 않는다 — 그 경우 48px 고정 스트립이 그대로여야 한다.
  it('keeps the fixed 48px strip when there is no description', () => {
    render(<PageHeader title="받은 견적 요청" count={3} />);
    expect(screen.getByTestId('page-header-row')).toHaveClass('h-12');
  });

  it('drops the fixed height when a description is present', () => {
    render(<PageHeader title="받은 견적 요청" description="설명" />);
    expect(screen.getByTestId('page-header-row')).not.toHaveClass('h-12');
  });
});
