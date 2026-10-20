import { beforeEach, describe, expect, it, vi } from 'vitest';

const signOutMock = vi.fn();
vi.mock('@/auth', () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));
vi.mock('@/lib/auth/cookie-config', () => ({
  sessionCookieClearHeaders: () => [],
  sessionCookieClearHeadersFor: () => [],
}));

import { GET } from '@/app/logout/route';

function request(next?: string) {
  const suffix = next ? `?next=${encodeURIComponent(next)}` : '';
  return new Request(`http://localhost/logout${suffix}`, {
    headers: {
      host: 'support-b.com',
      'x-forwarded-proto': 'https',
    },
  });
}

describe('GET /logout', () => {
  beforeEach(() => {
    signOutMock.mockReset().mockResolvedValue(undefined);
  });

  it('clears the stale session and preserves a safe internal post-login destination', async () => {
    const response = await GET(request('/rfp-create?resume=guest'));

    expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'https://support-b.com/login?next=%2Frfp-create%3Fresume%3Dguest',
    );
  });

  it('drops an external destination instead of creating an open redirect', async () => {
    const response = await GET(request('//evil.example/steal'));

    expect(response.headers.get('location')).toBe('https://support-b.com/login');
  });
});
