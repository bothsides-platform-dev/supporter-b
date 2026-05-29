import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

import { WorkspaceAvatar } from '../WorkspaceAvatar';

afterEach(() => {
  cleanup();
});

describe('WorkspaceAvatar', () => {
  it('renders initials when hasLogo is false', () => {
    render(<WorkspaceAvatar name="Supporter B" workspaceId="ws-1" hasLogo={false} />);
    expect(screen.getByRole('img')).toHaveTextContent('B');
  });

  it('renders initials when hasLogo is not provided', () => {
    render(<WorkspaceAvatar name="Acme Corp" />);
    expect(screen.getByRole('img')).toHaveTextContent('A');
  });

  it('renders img element when hasLogo is true and workspaceId is provided', () => {
    render(<WorkspaceAvatar name="Supporter B" workspaceId="ws-123" hasLogo={true} />);
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', '/api/workspace/ws-123/avatar');
    expect(img).toHaveAttribute('alt', 'Supporter B');
  });

  it('falls back to initials when img onError fires', () => {
    render(<WorkspaceAvatar name="Supporter B" workspaceId="ws-123" hasLogo={true} />);
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('IMG');

    fireEvent.error(img);

    // After error, initials should be shown instead
    const fallback = screen.getByRole('img');
    expect(fallback.tagName).not.toBe('IMG');
    expect(fallback).toHaveTextContent('B');
  });
});
