import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signAdminToken, verifyAdminToken } from '../admin-session';

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: () => undefined,
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));

beforeEach(() => {
  vi.stubEnv('ADMIN_SESSION_SECRET', 'test-secret-min-32-characters-long!!');
});

describe('signAdminToken / verifyAdminToken', () => {
  it('서명된 토큰을 검증하면 adminId를 반환한다', async () => {
    const token = await signAdminToken('admin');
    const result = await verifyAdminToken(token);
    expect(result).not.toBeNull();
    expect(result!.adminId).toBe('admin');
  });

  it('잘못된 토큰은 null을 반환한다', async () => {
    const result = await verifyAdminToken('invalid.token.here');
    expect(result).toBeNull();
  });

  it('만료된 토큰은 null을 반환한다', async () => {
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode('test-secret-min-32-characters-long!!');
    const expired = await new SignJWT({ adminId: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(new Date(Date.now() - 1000))
      .sign(secret);
    const result = await verifyAdminToken(expired);
    expect(result).toBeNull();
  });
});

describe('requireAdminSession', () => {
  it('쿠키 없으면 /admin/login으로 redirect', async () => {
    const { requireAdminSession } = await import('../admin-session');
    await expect(requireAdminSession()).rejects.toThrow('REDIRECT:/admin/login');
  });
});
