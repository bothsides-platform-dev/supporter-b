import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FaqAccordion } from '../FaqAccordion';

describe('FaqAccordion', () => {
  it('renders the three FAQ questions as accordion triggers', () => {
    render(<FaqAccordion />);
    expect(screen.getByRole('button', { name: /도입 수수료가 있나요/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /어떤 PG사 이용이 가능한가요/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /기능 건의 ?\/ ?문의 사항/ })).toBeInTheDocument();
  });

  it('reveals an answer when its question is activated', () => {
    render(<FaqAccordion />);
    fireEvent.click(screen.getByRole('button', { name: /도입 수수료가 있나요/ }));
    expect(screen.getByText(/2달 전 사전 공유 예정/)).toBeInTheDocument();
  });
});
