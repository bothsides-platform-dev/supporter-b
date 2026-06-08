import { describe, it, expect, afterEach } from 'vitest';
import { sessionCookie } from '../cookie-config';

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

describe('sessionCookie', () => {
  it('scopes the cookie to the parent domain when AUTH_COOKIE_DOMAIN is set', () => {
    process.env.AUTH_COOKIE_DOMAIN = '.supporter-b.com';
    process.env.NODE_ENV = 'production';
    const c = sessionCookie();
    expect(c.options.domain).toBe('.supporter-b.com');
    expect(c.options.secure).toBe(true);
    expect(c.options.sameSite).toBe('lax');
    expect(c.options.httpOnly).toBe(true);
    expect(c.name).toBe('__Secure-authjs.session-token');
  });

  it('omits the domain (host-only) and drops the __Secure- prefix outside production', () => {
    delete process.env.AUTH_COOKIE_DOMAIN;
    process.env.NODE_ENV = 'development';
    const c = sessionCookie();
    expect(c.options.domain).toBeUndefined();
    expect(c.options.secure).toBe(false);
    expect(c.name).toBe('authjs.session-token');
  });
});
