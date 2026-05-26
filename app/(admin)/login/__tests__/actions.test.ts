import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));

beforeEach(() => {
  vi.stubEnv('ADMIN_ID', 'testadmin');
  vi.stubEnv('ADMIN_PASSWORD', 'testpass123');
  vi.stubEnv('ADMIN_SESSION_SECRET', 'test-secret-min-32-characters-long!!');
});

describe('loginAction', () => {
  it('올바른 자격증명 → 쿠키 세팅 후 /admin 리다이렉트', async () => {
    const setCookieMock = vi.fn();
    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValue({ set: setCookieMock } as never);

    const { loginAction } = await import('../actions');
    await expect(loginAction({ adminId: 'testadmin', password: 'testpass123' }))
      .rejects.toThrow('REDIRECT:/admin');
    expect(setCookieMock).toHaveBeenCalledWith(
      expect.stringContaining('admin'),
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('잘못된 자격증명 → INVALID_CREDENTIALS 반환', async () => {
    const { loginAction } = await import('../actions');
    const result = await loginAction({ adminId: 'wrong', password: 'wrong' });
    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
  });
});
