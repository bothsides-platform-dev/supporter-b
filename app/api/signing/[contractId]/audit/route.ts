/**
 * GET /api/signing/{contractId}/audit — 감사추적인증서 온디맨드 프록시.
 * 세션·ACL·completed 검증 후 SnowSign 1시간 URL 로 302. (핸들러 공유)
 */
import { handleSigningDownload } from '@/lib/server/signing/download-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ contractId: string }> },
): Promise<Response> {
  const { contractId } = await ctx.params;
  return handleSigningDownload(contractId, 'audit');
}
