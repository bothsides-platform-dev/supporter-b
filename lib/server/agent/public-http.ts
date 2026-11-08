import { AGENT_CATALOG_VERSION } from './catalog';
import { recordAgentDiscoveryEvent, type AgentDiscoveryObservation } from './discovery-events';
import { guardPublicAgentRequest } from './public-guard';

export const PUBLIC_AGENT_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Host, Origin',
};

type Observation = Pick<AgentDiscoveryObservation, 'surface' | 'operation' | 'serviceId'>;

export function publicAgentJson(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: PUBLIC_AGENT_HEADERS });
}

export function discoveryOutcome(status: number): AgentDiscoveryObservation['outcome'] {
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'error';
  if (status === 403 || status === 404) return 'rejected';
  if (status >= 400) return 'invalid_request';
  return 'ok';
}

export async function observePublicAgentRequest(observation: Observation, started: number, outcome: AgentDiscoveryObservation['outcome']) {
  await recordAgentDiscoveryEvent({
    ...observation, outcome, catalogVersion: AGENT_CATALOG_VERSION,
    durationMs: Math.max(0, performance.now() - started),
  });
}

export async function servePublicAgentRead(request: Request, observation: Observation, serve: () => Response | Promise<Response>): Promise<Response> {
  const started = performance.now();
  try {
    const rejected = guardPublicAgentRequest(request);
    if (rejected) {
      await observePublicAgentRequest(observation, started, discoveryOutcome(rejected.status));
      return rejected;
    }
    const response = await serve();
    await observePublicAgentRequest(observation, started,
      response.status === 404 ? 'unsupported_service' : discoveryOutcome(response.status));
    return response;
  } catch {
    await observePublicAgentRequest(observation, started, 'error');
    return publicAgentJson({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503);
  }
}
