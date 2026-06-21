import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionExpiredNotice } from '../SessionExpiredNotice';

describe('SessionExpiredNotice', () => {
  it('shows a re-login notice when reason is "session"', () => {
    render(<SessionExpiredNotice reason="session" />);
    expect(screen.getByRole('status')).toHaveTextContent('다시 로그인');
  });

  it('renders nothing for any other reason', () => {
    const { container } = render(<SessionExpiredNotice reason={null} />);
    expect(container).toBeEmptyDOMElement();
    const { container: c2 } = render(<SessionExpiredNotice reason="other" />);
    expect(c2).toBeEmptyDOMElement();
  });
});
