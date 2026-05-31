import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSetWorkspaceType = vi.fn();
const mockReset = vi.fn();
vi.mock('@/lib/stores/signup-draft', () => ({
  useSignupDraftStore: () => ({
    setWorkspaceType: mockSetWorkspaceType,
    reset: mockReset,
  }),
}));

import { PgSignupCtaButton } from '../PgSignupCtaButton';

describe('PgSignupCtaButton', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockSetWorkspaceType.mockReset();
    mockReset.mockReset();
  });

  it('renders the label passed as children', () => {
    render(<PgSignupCtaButton>입찰 알림 받기 시작 →</PgSignupCtaButton>);
    expect(screen.getByRole('button', { name: /입찰 알림 받기 시작/i })).toBeInTheDocument();
  });

  it('resets the draft, sets workspaceType=pg, then pushes /signup/pg on click', async () => {
    const user = userEvent.setup();
    render(<PgSignupCtaButton>start</PgSignupCtaButton>);

    await user.click(screen.getByRole('button', { name: /start/i }));

    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockSetWorkspaceType).toHaveBeenCalledWith('pg');
    expect(mockPush).toHaveBeenCalledWith('/signup/pg');

    const resetOrder = mockReset.mock.invocationCallOrder[0];
    const setOrder = mockSetWorkspaceType.mock.invocationCallOrder[0];
    const pushOrder = mockPush.mock.invocationCallOrder[0];
    expect(resetOrder).toBeLessThan(setOrder);
    expect(setOrder).toBeLessThan(pushOrder);
  });
});
