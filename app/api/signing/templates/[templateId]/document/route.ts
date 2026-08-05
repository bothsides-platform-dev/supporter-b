/**
 * GET /api/signing/templates/{templateId}/document — 계약서 템플릿 원본 PDF
 * 스트리밍 프록시. 세션·소유 검증 후 SnowSign 1시간 URL 을 서버가 fetch 해 중계.
 * (핸들러 공유 — 검증·스트리밍 로직은 lib/server/signing/template-pdf-handler.ts)
 */
import { handleTemplatePdf } from '@/lib/server/signing/template-pdf-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ templateId: string }> },
): Promise<Response> {
  const { templateId } = await ctx.params;
  return handleTemplatePdf(templateId);
}
