import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordAgentObservation } from '@/lib/server/services/agent-analytics';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { DELETE, GET, POST } from '@/app/api/agent/mcp/route';
import { logger } from '@/lib/observability/logger';
import { AGENT_CATALOG_VERSION, PG_CONSULTATION_ID } from '../catalog';
import { __resetAgentDiscoveryEventsForTest } from '../discovery-events';
import { __resetPublicAgentBudgetForTest } from '../public-guard';

vi.mock('@/lib/server/services/agent-analytics', () => ({
  recordAgentObservation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/observability/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ENDPOINT = 'http://localhost:3000/api/agent/mcp';
const clients: Client[] = [];
type Exchange = {
  method: string;
  rpcMethod: string | undefined;
  status: number;
  protocolVersion: string | null;
  headers: Headers;
  body: string;
};

async function connect(mode: 'auto' | 'legacy') {
  const exchanges: Exchange[] = [];
  const fetchThroughRoute: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    // The SDK receives only this in-process fetch implementation. Any attempted
    // metadata URL or other network endpoint fails the test instead of escaping.
    expect(request.url).toBe(ENDPOINT);
    const message = request.method === 'POST'
      ? await request.clone().json().catch(() => undefined) as { method?: string } | undefined
      : undefined;
    const response = request.method === 'POST' ? await POST(request)
      : request.method === 'GET' ? GET(request)
        : request.method === 'DELETE' ? DELETE(request)
          : new Response(null, { status: 405 });
    exchanges.push({
      method: request.method,
      rpcMethod: message?.method,
      status: response.status,
      protocolVersion: request.headers.get('mcp-protocol-version'),
      headers: response.headers,
      body: await response.clone().text(),
    });
    return response;
  };
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), { fetch: fetchThroughRoute });
  const client = new Client({ name: 'fixture-private-client-name', version: 'fixture-version' }, {
    versionNegotiation: { mode },
  });
  clients.push(client);
  await client.connect(transport);
  return { client, exchanges };
}

function observed(operation: string, outcome: string) {
  expect(logger.info).toHaveBeenCalledWith('agent.discovery', expect.objectContaining({
    surface: 'mcp', operation, outcome,
  }));
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_BUYER_ORIGIN', 'http://localhost:3000');
  vi.stubEnv('NEXT_PUBLIC_PARTNER_ORIGIN', 'http://localhost:3001');
  vi.clearAllMocks();
  vi.mocked(recordAgentObservation).mockReset().mockResolvedValue(undefined);
  __resetPublicAgentBudgetForTest();
  __resetAgentDiscoveryEventsForTest();
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close()));
  vi.unstubAllEnvs();
});

describe.each(['auto', 'legacy'] as const)('public MCP with official client (%s)', mode => {
  it('negotiates the protocol and reads all three tools and the guide resource', async () => {
    const { client, exchanges } = await connect(mode);
    expect(client.getServerVersion()).toMatchObject({ name: 'support-b', version: '0.1.0' });
    expect(client.getServerCapabilities()).toMatchObject({
      tools: { listChanged: false }, resources: { listChanged: false, subscribe: false },
    });
    expect(exchanges.some(item => item.rpcMethod === (mode === 'auto' ? 'server/discover' : 'initialize'))).toBe(true);
    if (mode === 'auto') expect(exchanges.some(item => item.rpcMethod === 'initialize')).toBe(false);

    const list = await client.listTools();
    expect(list.tools.map(tool => tool.name).sort()).toEqual(['get_integration_guide', 'get_requirements', 'list_services']);
    for (const tool of list.tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }

    const catalog = await client.callTool({ name: 'list_services', arguments: {} });
    expect(catalog.isError).not.toBe(true);
    expect(catalog.structuredContent).toMatchObject({
      catalogVersion: AGENT_CATALOG_VERSION,
      channel: { status: 'public_discovery', authenticationRequired: false, applicationChannel: 'web' },
      services: [{ id: PG_CONSULTATION_ID, availability: { agentSubmission: false, unifiedSdk: false } }],
    });
    const text = catalog.content.find(item => item.type === 'text');
    expect(text?.type === 'text' ? JSON.parse(text.text) : undefined).toEqual(catalog.structuredContent);

    const initial = await client.callTool({ name: 'get_requirements', arguments: { serviceId: PG_CONSULTATION_ID } });
    expect(initial.isError).not.toBe(true);
    expect(initial.structuredContent).toMatchObject({
      serviceId: PG_CONSULTATION_ID, contractType: 'new',
      nextAction: { type: 'open_web_application', url: 'http://localhost:3000/quote-start' },
    });
    const renewal = await client.callTool({ name: 'get_requirements', arguments: { serviceId: PG_CONSULTATION_ID, contractType: 'renewal' } });
    expect(renewal.structuredContent).toMatchObject({ contractType: 'renewal' });

    const guide = await client.callTool({ name: 'get_integration_guide', arguments: { serviceId: PG_CONSULTATION_ID } });
    expect(guide.isError).not.toBe(true);
    expect(guide.structuredContent).toMatchObject({ serviceId: PG_CONSULTATION_ID, status: 'preparation_only' });

    const resources = await client.listResources();
    expect(resources.resources).toEqual([expect.objectContaining({ uri: 'support-b://guides/pg-onboarding', mimeType: 'text/markdown' })]);
    const resource = await client.readResource({ uri: 'support-b://guides/pg-onboarding' });
    expect(resource.contents).toEqual([expect.objectContaining({
      uri: 'support-b://guides/pg-onboarding', mimeType: 'text/markdown',
      text: expect.stringContaining('http://localhost:3000/api/agent/mcp'),
    })]);
    expect(await client.listResourceTemplates()).toMatchObject({ resourceTemplates: [] });

    for (const exchange of exchanges.filter(item => item.method === 'POST')) {
      expect(exchange.status).toBeLessThan(300);
      expect(exchange.headers.get('cache-control')).toBe('no-store');
      expect(exchange.headers.get('x-content-type-options')).toBe('nosniff');
      expect(exchange.headers.get('mcp-session-id')).toBeNull();
    }
    const toolExchange = exchanges.find(item => item.rpcMethod === 'tools/call');
    expect(toolExchange?.protocolVersion).toMatch(mode === 'auto' ? /^2026-/ : /^2025-/);
    observed('catalog', 'ok');
    observed('requirements', 'ok');
    observed('guide', 'ok');
    observed('resource_read', 'ok');
    expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain('fixture-private-client-name');
  });

  it('rejects attempts to call application or contract-writing tools', async () => {
    const { client, exchanges } = await connect(mode);
    for (const name of ['submit_request', 'prepare_request', 'sign_contract']) {
      vi.mocked(logger.info).mockClear();
      await expect(client.callTool({ name, arguments: {} })).rejects.toMatchObject({ code: -32602 });
      const exchange = exchanges.filter(item => item.rpcMethod === 'tools/call').at(-1)!;
      expect(exchange.status).toBeLessThan(500);
      expect(exchange.body).not.toContain('SERVICE_UNAVAILABLE');
      observed('tool_call', 'invalid_request');
    }
  });

  it('rejects extra fields and unsupported service IDs with HTTP-200 errors recorded as invalid requests', async () => {
    const { client, exchanges } = await connect(mode);
    const invalidCalls = [
      { name: 'list_services', arguments: { apiKey: 'private-key-sentinel' }, operation: 'catalog' },
      { name: 'get_requirements', arguments: { serviceId: 'cloud-compute' }, operation: 'requirements' },
      { name: 'get_requirements', arguments: { serviceId: PG_CONSULTATION_ID, contractType: 'invalid' }, operation: 'requirements' },
      { name: 'get_integration_guide', arguments: { serviceId: PG_CONSULTATION_ID, workspaceId: 'private-workspace-sentinel' }, operation: 'guide' },
    ];
    for (const { name, arguments: args, operation } of invalidCalls) {
      vi.mocked(logger.info).mockClear();
      const response = await client.callTool({ name, arguments: args });
      expect(response.isError).toBe(true);
      const exchange = exchanges.filter(item => item.rpcMethod === 'tools/call').at(-1)!;
      expect(exchange.status).toBe(200);
      observed(operation, 'invalid_request');
      const recorded = JSON.stringify(vi.mocked(logger.info).mock.calls);
      expect(recorded).not.toContain('private-key-sentinel');
      expect(recorded).not.toContain('private-workspace-sentinel');
      expect(recorded).not.toContain('cloud-compute');
    }
  });
});

describe('public MCP HTTP ingress', () => {
  it.each([['GET', GET], ['DELETE', DELETE]] as const)('returns 405 for %s without starting a session stream', (method, handler) => {
    const response = handler(new Request(ENDPOINT, { method }));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects malformed JSON as a request error without retaining its body', async () => {
    const response = await POST(new Request(ENDPOINT, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: '{"private-body-sentinel":',
    }));
    expect(response.status).toBe(400);
    observed('unknown', 'invalid_request');
    expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain('private-body-sentinel');
  });

  it('bounds actual UTF-8 bytes even without a content-length header', async () => {
    const response = await POST(new Request(ENDPOINT, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '💳'.repeat(16_385),
    }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: { code: 'BODY_TOO_LARGE' } });
    observed('unknown', 'invalid_request');
  });

  it('rejects a batched call-and-cancel request before it can leave an SSE stream open', async () => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        POST(new Request(ENDPOINT, {
          method: 'POST', signal: controller.signal,
          headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25' },
          body: JSON.stringify([
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_services', arguments: {} } },
            { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } },
          ]),
        })),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => { controller.abort(); reject(new Error('Batch rejection did not complete within 1 second.')); }, 1000);
        }),
      ]);
      expect(response.status).toBe(400);
      observed('unknown', 'invalid_request');
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  });
});
