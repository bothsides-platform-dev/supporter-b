import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PresenceDot } from '@/components/presence/PresenceDot';

describe('PresenceDot', () => {
  it('renders an online dot with an aria-label', () => {
    const { getByLabelText } = render(<PresenceDot activity="active" />);
    expect(getByLabelText('온라인')).toBeTruthy();
  });

  it('renders nothing when offline', () => {
    const { container } = render(<PresenceDot activity="offline" />);
    expect(container.firstChild).toBeNull();
  });

  it('labels idle as 자리 비움', () => {
    const { getByLabelText } = render(<PresenceDot activity="idle" />);
    expect(getByLabelText('자리 비움')).toBeTruthy();
  });
});
