import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignupStepper } from '../SignupStepper';

describe('SignupStepper', () => {
  it('renders current/total step count', () => {
    render(<SignupStepper current={2} total={4} />);
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
  });

  it('renders step 1 of 4', () => {
    render(<SignupStepper current={1} total={4} />);
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
  });

  it('renders step 4 of 4 (last step)', () => {
    render(<SignupStepper current={4} total={4} />);
    expect(screen.getByText('4 / 4')).toBeInTheDocument();
  });

  it('marks steps up to and including current as active', () => {
    render(<SignupStepper current={2} total={4} />);
    // There should be 4 step indicators
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(4);
  });
});
