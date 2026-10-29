import { cookies } from 'next/headers';
import { checkGuestDraftRequestBoundary, readGuestDraftBody, GUEST_DRAFT_COOKIE } from '@/lib/server/guest-rfp/draft-request';
import { getQuoteSavingsService, savingsRequestSchema } from '@/lib/server/services/quote-savings';
export async function POST(request: Request) {
  const denied = checkGuestDraftRequestBoundary(request);
  if (denied) return new Response(null, { status: denied });
  try {
    const input = savingsRequestSchema.safeParse(await readGuestDraftBody(request));
    if (!input.success) return new Response(null, { status: 400 });
    const secret = (await cookies()).get(GUEST_DRAFT_COOKIE)?.value;
    if (!secret) return new Response(null, { status: 403 });
    return Response.json(await (await getQuoteSavingsService()).calculate(input.data, secret), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return Response.json({ error: code.startsWith('GUEST_') ? code : 'SAVINGS_UNAVAILABLE' },
      { status: code === 'BODY_TOO_LARGE' ? 413 : code.startsWith('GUEST_') ? 409 : 503 });
  }
}
