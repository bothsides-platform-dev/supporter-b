import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/observability/sentry-user', () => ({ setSentryUser: vi.fn() }));

import { setSentryUser } from '@/lib/observability/sentry-user';
import { SentryUserContext } from '../SentryUserContext';

const user = {
  id: 'u1',
  workspaceId: 'w1',
  workspaceType: 'buyer' as const,
  role: 'admin' as const,
};

beforeEach(() => {
  vi.mocked(setSentryUser).mockReset();
});

describe('SentryUserContext', () => {
  it('calls setSentryUser with the user on mount', () => {
    render(<SentryUserContext user={user} />);

    expect(setSentryUser).toHaveBeenCalledWith(user);
  });

  it('renders nothing', () => {
    const { container } = render(<SentryUserContext user={user} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('re-runs when the user id changes', () => {
    const { rerender } = render(<SentryUserContext user={user} />);
    expect(setSentryUser).toHaveBeenCalledTimes(1);

    rerender(<SentryUserContext user={{ ...user, id: 'u2' }} />);

    expect(setSentryUser).toHaveBeenCalledTimes(2);
  });
});
