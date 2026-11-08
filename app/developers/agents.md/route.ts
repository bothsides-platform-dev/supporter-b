import { buildAgentGuide } from '@/lib/server/agent/guide';
import { PUBLIC_AGENT_HEADERS, servePublicAgentRead } from '@/lib/server/agent/public-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request): Promise<Response> {
  return servePublicAgentRead(request, { surface: 'guide', operation: 'guide' }, () => new Response(buildAgentGuide(), {
    headers: { ...PUBLIC_AGENT_HEADERS, 'Content-Type': 'text/markdown; charset=utf-8' },
  }));
}
