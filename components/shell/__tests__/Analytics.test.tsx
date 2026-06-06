import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Analytics } from '../Analytics';

vi.mock('@next/third-parties/google', () => ({
  GoogleAnalytics: ({ gaId }: { gaId: string }) => (
    <div data-testid="ga" data-ga-id={gaId} />
  ),
}));

describe('Analytics', () => {
  it('renders GoogleAnalytics with the provided measurement id', () => {
    const { getByTestId } = render(<Analytics gaId="G-TEST123" />);
    expect(getByTestId('ga').getAttribute('data-ga-id')).toBe('G-TEST123');
  });

  it('renders nothing when gaId is absent', () => {
    const { queryByTestId } = render(<Analytics gaId={undefined} />);
    expect(queryByTestId('ga')).toBeNull();
  });
});
