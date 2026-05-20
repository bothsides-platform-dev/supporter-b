import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { JoinWorkspaceForm } from '../JoinWorkspaceForm';

beforeEach(() => push.mockReset());

describe('JoinWorkspaceForm', () => {
  it('disables 합류하기 until a token is entered', async () => {
    const user = userEvent.setup();
    render(<JoinWorkspaceForm />);
    expect(screen.getByRole('button', { name: '합류하기' })).toBeDisabled();
    await user.type(screen.getByLabelText('초대 링크 또는 토큰'), 'tok123');
    expect(screen.getByRole('button', { name: '합류하기' })).toBeEnabled();
  });

  it('navigates to the accept route with the extracted token', async () => {
    const user = userEvent.setup();
    render(<JoinWorkspaceForm />);
    await user.type(
      screen.getByLabelText('초대 링크 또는 토큰'),
      'https://app.example.com/invite/workspace/tok123',
    );
    await user.click(screen.getByRole('button', { name: '합류하기' }));
    expect(push).toHaveBeenCalledWith('/invite/workspace/tok123');
  });
});
