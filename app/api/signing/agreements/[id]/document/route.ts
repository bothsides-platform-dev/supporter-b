import { handleAgreementDocument } from '@/lib/server/signing/agreement-document';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleAgreementDocument(request, (await context.params).id);
}
