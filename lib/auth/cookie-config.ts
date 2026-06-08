/**
 * Session-cookie config shared by auth.ts (Node) and proxy.ts (Edge).
 * MUST stay import-free of Node-only modules — only reads process.env.
 *
 * AUTH_COOKIE_DOMAIN='.supporter-b.com' makes the cookie valid on both
 * supporter-b.com and partner.supporter-b.com (cross-host SSO). Leave unset
 * locally for a host-only cookie on localhost.
 */
export function sessionCookie() {
  const prod = process.env.NODE_ENV === 'production';
  const domain = process.env.AUTH_COOKIE_DOMAIN || undefined;
  return {
    name: prod ? '__Secure-authjs.session-token' : 'authjs.session-token',
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      secure: prod,
      ...(domain ? { domain } : {}),
    },
  };
}
