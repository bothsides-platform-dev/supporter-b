import { checkMyEmailVerifiedAction } from '@/lib/server/actions/auth/checkMyEmailVerifiedAction';

// /api is outside the Auth.js proxy: delayed status responses must never
// rotate an old session cookie over the cookie issued by email verification.
export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  if (!input || typeof input.email !== 'string' || input.email.length > 254) {
    return Response.json({ verified: false }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
  }
  return Response.json(await checkMyEmailVerifiedAction(input.email), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
