import { z } from 'zod';
import { requireActiveWorkspace } from '@/lib/server/actions/_session';
import { getAgreementService } from '@/lib/server/services/agreement';
import { AgreementPartiesSchema, agreementErrorMessage } from '@/lib/contract-doc/agreement';
import { renderContractPdf } from '@/lib/contract-doc/render-pdf';
import { collectDrawableText } from '@/lib/contract-doc/doc-text';
import { loadGlyphCoverage, missingGlyphs } from '@/lib/contract-doc/pdf-font';
import { consumePreviewRenderBudget } from './preview-rate-limit';
import { logger } from '@/lib/observability/logger';

function privateError(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function handleAgreementDocument(
  request: Request,
  contractId: string,
): Promise<Response> {
  const actor = await requireActiveWorkspace();
  if (!actor.ok) return privateError('접근 권한을 확인해 주세요.', 403);
  if (!z.uuid().safeParse(contractId).success)
    return privateError('잘못된 요청이에요.', 400);
  if (consumePreviewRenderBudget(actor.userId) !== 'ok')
    return privateError('잠시 후 다시 확인해 주세요.', 429);
  try {
    const view = await (await getAgreementService()).load(contractId, actor);
    if (!view.ok || view.mode !== 'agreement' || !view.snapshot)
      return privateError('문서를 확인할 수 없어요.', 403);
    if (view.editable) {
      if (new URL(request.url).searchParams.get('stamp') !== view.stamp)
        return privateError(agreementErrorMessage('AGREEMENT_CHANGED'), 409);
      if (view.error || !AgreementPartiesSchema.safeParse(view.parties).success)
        return privateError(agreementErrorMessage(view.error ?? 'AGREEMENT_INCOMPLETE'), 400);
    }
    if (missingGlyphs(collectDrawableText(view.snapshot), await loadGlyphCoverage()).length)
      return privateError('표시할 수 없는 문자가 있어요. 회사 정보를 확인해 주세요.', 400);
    const pdf = await renderContractPdf(view.snapshot);
    return new Response(pdf.bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline; filename="agreement.pdf"',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logger.error('signing.agreement_document_failed', {
      contractId,
      err: String(error),
    });
    return privateError('문서를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.', 500);
  }
}
