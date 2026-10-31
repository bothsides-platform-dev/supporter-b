import { cookies } from 'next/headers';
import { z } from 'zod';
import { checkGuestDraftRequestBoundary, readGuestDraftBody, GUEST_DRAFT_COOKIE } from '@/lib/server/guest-rfp/draft-request';
import { getQuoteAssistService } from '@/lib/server/services/quote-assist';
import { isValidWebsiteUrl } from '@/lib/validation/website-url';
export const runtime = 'nodejs';
const base = { id: z.string().uuid(), revision: z.number().int().min(1), retry: z.string().uuid().optional() };
const inputSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('business'), input: z.string().regex(/^\d{10}$/) }).strict(),
  z.object({ ...base, kind: z.literal('website'), input: z.string().url().max(500).refine(isValidWebsiteUrl) }).strict(),
]);
export async function POST(request: Request) {
  const denied = checkGuestDraftRequestBoundary(request);
  if (denied) return new Response(null, { status: denied });
  try {
    const input = inputSchema.safeParse(await readGuestDraftBody(request));
    if (!input.success) return new Response(null, { status: 400 });
    const secret = (await cookies()).get(GUEST_DRAFT_COOKIE)?.value;
    if (!secret) return new Response(null, { status: 403 });
    const ip = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
    const result = await (await getQuoteAssistService()).analyze(input.data, secret, ip);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return Response.json({ error: code.startsWith('GUEST_') ? code : 'ANALYSIS_UNAVAILABLE' },
      { status: code === 'BODY_TOO_LARGE' ? 413 : code.startsWith('GUEST_') ? 409 : 503 });
  }
}

