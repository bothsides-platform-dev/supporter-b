import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { getPublicIntegrationGuide, getPublicRequirements, getPublicServiceCatalog, PG_CONSULTATION_ID } from './catalog';
import { buildAgentGuide } from './guide';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function result(data: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], structuredContent: data };
}

/** The same finite public definitions serve modern MCP and stateless 2025 clients. */
export function createPublicMcpHandler() {
  return createMcpHandler(() => {
    const server = new McpServer({ name: 'support-b', version: '0.1.0' }, {
      capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false } },
    });
    server.registerTool('list_services', {
      description: 'List Support-b services for Korean merchants needing a new PG or a PG-switching consultation. Not needed for existing-provider code fixes. Currently payments only; no cloud procurement or package SDK. Read-only; does not send a consultation.',
      inputSchema: z.object({}).strict(),
      annotations: READ_ONLY,
    }, async () => result(getPublicServiceCatalog()));
    server.registerTool('get_requirements', {
      description: 'Get preparation questions for a Korean PG onboarding (new) or switching (renewal) consultation. No business details or credentials should be submitted here. Actual application and provider review happen on the web.',
      inputSchema: z.object({
        serviceId: z.literal(PG_CONSULTATION_ID),
        contractType: z.enum(['new', 'renewal']).default('new'),
      }).strict(),
      annotations: READ_ONLY,
    }, async ({ contractType }) => result(getPublicRequirements(contractType)));
    server.registerTool('get_integration_guide', {
      description: 'Get the preparation sequence from PG consultation to the provider’s official integration documentation. This is not a runnable payment SDK. The customer contracts with the provider and follows that provider’s terms.',
      inputSchema: z.object({ serviceId: z.literal(PG_CONSULTATION_ID) }).strict(),
      annotations: READ_ONLY,
    }, async () => result(getPublicIntegrationGuide()));
    server.registerResource('agent-guide', 'support-b://guides/pg-onboarding', {
      title: 'Support-b Korean PG onboarding guide', mimeType: 'text/markdown',
      description: 'Public capabilities, limitations, preparation steps and provider contract boundaries.',
    }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: buildAgentGuide() }] }));
    return server;
  }, {
    legacy: 'stateless',
    maxRequestBodySize: 65_536,
    maxSubscriptions: 0,
    keepAliveMs: 0,
  });
}
