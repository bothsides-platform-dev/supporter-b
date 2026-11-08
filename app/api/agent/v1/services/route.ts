import { getPublicServiceCatalog } from '@/lib/server/agent/catalog';
import { publicAgentJson, servePublicAgentRead } from '@/lib/server/agent/public-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request): Promise<Response> {
  return servePublicAgentRead(request, { surface: 'rest', operation: 'catalog' }, () => publicAgentJson(getPublicServiceCatalog()));
}
