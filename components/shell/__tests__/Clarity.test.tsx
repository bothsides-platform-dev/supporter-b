import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Clarity } from '../Clarity';

describe('Clarity', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders nothing in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { container } = render(<Clarity />);
    expect(container.querySelector('script')).toBeNull();
  });

  it('renders the Clarity snippet with the project id outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { container } = render(<Clarity />);
    const script = container.querySelector('script');
    expect(script).not.toBeNull();
    expect(script?.innerHTML).toContain('clarity.ms/tag/');
    expect(script?.innerHTML).toContain('xiq81e87yn');
  });
});
