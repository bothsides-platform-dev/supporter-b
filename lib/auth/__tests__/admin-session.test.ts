import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signAdminToken, verifyAdminToken, requireAdminSession } from '../admin-session';

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

describe('verifyAdminToken — 시크릿 설정 오류', () => {
  it('ADMIN_SESSION_SECRET 미설정 시 null 반환이 아닌 throw한다', async () => {
    vi.stubEnv('ADMIN_SESSION_SECRET', '');
    await expect(verifyAdminToken('any.token.here')).rejects.toThrow('ADMIN_SESSION_SECRET');
  });

  it('ADMIN_SESSION_SECRET 32자 미만 시 null 반환이 아닌 throw한다', async () => {
    vi.stubEnv('ADMIN_SESSION_SECRET', 'too-short');
    await expect(verifyAdminToken('any.token.here')).rejects.toThrow('ADMIN_SESSION_SECRET');
  });

  it('다른 시크릿으로 서명된 토큰(시크릿 회전)은 null을 반환한다', async () => {
    const { SignJWT } = await import('jose');
    const otherSecret = new TextEncoder().encode('other-secret-completely-different-value!!');
    const staleToken = await new SignJWT({ adminId: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(otherSecret);
    // 현재 시크릿은 beforeEach의 'test-secret-min-32-characters-long!!'
    const result = await verifyAdminToken(staleToken);
    expect(result).toBeNull();
  });
});

describe('requireAdminSession', () => {
  it('쿠키 없으면 /admin/login으로 redirect', async () => {
    await expect(requireAdminSession()).rejects.toThrow('REDIRECT:/admin/login');
  });

  it('시크릿 회전 후 stale 쿠키가 있으면 /admin/login으로 redirect한다', async () => {
    const { SignJWT } = await import('jose');
    const otherSecret = new TextEncoder().encode('other-secret-completely-different-value!!');
    const staleToken = await new SignJWT({ adminId: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(otherSecret);

    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValueOnce({
      get: (name: string) =>
        name === 'admin-token' ? { name: 'admin-token', value: staleToken } : undefined,
    } as Awaited<ReturnType<typeof cookies>>);

    await expect(requireAdminSession()).rejects.toThrow('REDIRECT:/admin/login');
  });
});
