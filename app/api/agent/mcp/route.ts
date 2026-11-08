import { createPublicMcpHandler } from '@/lib/server/agent/mcp';
import { mcpOperation, mcpResponseFailed } from '@/lib/server/agent/mcp-observation';
import { discoveryOutcome, observePublicAgentRequest, PUBLIC_AGENT_HEADERS, publicAgentJson } from '@/lib/server/agent/public-http';
import { guardPublicAgentRequest } from '@/lib/server/agent/public-guard';
import { readBoundedBody } from '@/lib/server/http/bounded-body';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handler = createPublicMcpHandler();

export async function POST(request: Request): Promise<Response> {
  const started = performance.now();
  let operation: ReturnType<typeof mcpOperation> = 'unknown';
  const observe = (outcome: Parameters<typeof observePublicAgentRequest>[2]) =>
    observePublicAgentRequest({ surface: 'mcp', operation }, started, outcome);
  try {
    const rejected = guardPublicAgentRequest(request);
    if (rejected) { await observe(discoveryOutcome(rejected.status)); return rejected; }
    const body = await readBoundedBody(request);
    if (typeof body === 'number') {
      await observe('invalid_request');
      return publicAgentJson({ error: { code: body === 413 ? 'BODY_TOO_LARGE' : 'BODY_TIMEOUT' } }, body);
    }
    operation = mcpOperation(body);
    // A legacy batch can cancel its own request and leave an unfinished SSE
    // exchange. This finite public channel accepts single messages only.
    let batch = false;
    try { batch = Array.isArray(JSON.parse(body)); } catch { /* SDK returns the parse error. */ }
    if (batch) {
      await observe('invalid_request');
      return publicAgentJson({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batch requests are not supported.' } }, 400);
    }
    const controller = new AbortController();
    const forwarded = new Request(request.url, {
      method: 'POST', headers: request.headers, body,
      signal: AbortSignal.any([request.signal, controller.signal]),
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('MCP exchange timed out'));
      }, 5_000);
    });
    try {
      const { response, outcome } = await Promise.race([expired, (async () => {
        const response = await handler.fetch(forwarded);
        const outcome = response.ok && await mcpResponseFailed(response) ? 'invalid_request' : discoveryOutcome(response.status);
        return { response, outcome };
      })()]);
      await observe(outcome);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(PUBLIC_AGENT_HEADERS)) headers.set(key, value);
      return new Response(response.body, { status: response.status, headers });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    await observe('error');
    return publicAgentJson({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503);
  }
}

// No session or persistent subscription stream is exposed by this public channel.
export function GET(request: Request): Response {
  return guardPublicAgentRequest(request) ?? new Response(null, { status: 405, headers: { ...PUBLIC_AGENT_HEADERS, Allow: 'POST' } });
}

export const DELETE = GET;
