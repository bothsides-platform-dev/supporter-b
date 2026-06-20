import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Avatar } from '../Avatar';

afterEach(() => cleanup());

describe('Avatar', () => {
  it('renders initials when no userId/avatarUpdatedAt', () => {
    render(<Avatar name="홍 길동" />);
    expect(screen.getByLabelText('홍 길동')).toHaveTextContent('홍길');
  });

  it('renders initials when avatarUpdatedAt is null even with userId', () => {
    render(<Avatar name="Acme" userId="u-1" avatarUpdatedAt={null} />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders <img> with cache-bust ?v when userId + avatarUpdatedAt present', () => {
    render(<Avatar name="Acme" userId="u-1" avatarUpdatedAt="2026-06-21T00:00:00.000Z" />);
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('IMG');
    const ms = Date.parse('2026-06-21T00:00:00.000Z');
    expect(img).toHaveAttribute('src', `/api/user/u-1/avatar?v=${ms}`);
    expect(img).toHaveAttribute('alt', 'Acme');
  });

  it('falls back to initials when img onError fires', () => {
    render(<Avatar name="Acme Corp" userId="u-1" avatarUpdatedAt="2026-06-21T00:00:00.000Z" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByLabelText('Acme Corp')).toHaveTextContent('AC');
  });
});
