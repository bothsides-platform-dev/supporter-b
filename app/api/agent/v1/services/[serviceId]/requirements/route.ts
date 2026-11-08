import { getPublicRequirements, PG_CONSULTATION_ID } from '@/lib/server/agent/catalog';
import { publicAgentJson, servePublicAgentRead } from '@/lib/server/agent/public-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request, context: { params: Promise<{ serviceId: string }> }): Promise<Response> {
  return servePublicAgentRead(request, { surface: 'rest', operation: 'requirements' }, async () => {
    const { serviceId } = await context.params;
    if (serviceId !== PG_CONSULTATION_ID) return publicAgentJson({ error: { code: 'UNSUPPORTED_SERVICE' } }, 404);
    const types = new URL(request.url).searchParams.getAll('contractType');
    const contractType = types[0] ?? 'new';
    if (types.length > 1 || (contractType !== 'new' && contractType !== 'renewal')) {
      return publicAgentJson({ error: { code: 'INVALID_CONTRACT_TYPE' } }, 400);
    }
    return publicAgentJson(getPublicRequirements(contractType));
  });
}
