import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signIn = vi.fn();
vi.mock('next-auth/react', () => ({
  signIn: (...a: unknown[]) => signIn(...a),
}));

import { OpsGoogleLogin } from '../OpsGoogleLogin';

beforeEach(() => signIn.mockReset());

describe('OpsGoogleLogin', () => {
  it('Google 로그인 버튼을 렌더한다', () => {
    render(<OpsGoogleLogin />);
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
  });

  it('클릭 시 signIn("google", { callbackUrl: "/home" })를 호출한다', async () => {
    const user = userEvent.setup();
    render(<OpsGoogleLogin />);
    await user.click(screen.getByRole('button', { name: /google/i }));
    expect(signIn).toHaveBeenCalledWith('google', { callbackUrl: '/home' });
  });
});
