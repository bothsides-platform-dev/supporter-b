import type { AgentDiscoveryObservation } from './discovery-events';

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

// A finite projection for telemetry only. Protocol validation belongs to the SDK.
export function mcpOperation(body: string): AgentDiscoveryObservation['operation'] {
  try {
    const message = object(JSON.parse(body));
    const operations: Record<string, AgentDiscoveryObservation['operation']> = {
      'server/discover': 'initialize', initialize: 'initialize', ping: 'ping',
      'tools/list': 'tools_list', 'resources/list': 'resources_list',
      'resources/templates/list': 'resource_templates_list', 'resources/read': 'resource_read',
      'notifications/initialized': 'notification', 'notifications/cancelled': 'notification',
    };
    if (message?.method === 'tools/call') {
      const name = object(message.params)?.name;
      if (name === 'list_services') return 'catalog';
      if (name === 'get_requirements') return 'requirements';
      if (name === 'get_integration_guide') return 'guide';
      return 'tool_call';
    }
    return typeof message?.method === 'string' && Object.hasOwn(operations, message.method)
      ? operations[message.method] : 'unknown';
  } catch { return 'unknown'; }
}

/** HTTP 200 may contain a protocol/tool error. Never retain its text or arguments. */
export async function mcpResponseFailed(response: Response): Promise<boolean> {
  if (response.status === 202) return false;
  const text = await response.clone().text();
  const frames = response.headers.get('content-type')?.includes('text/event-stream')
    ? text.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim())
    : [text];
  let sawResult = false;
  for (const frame of frames) {
    try {
      const message = object(JSON.parse(frame));
      if (message?.error || object(message?.result)?.isError === true) return true;
      if (message && Object.hasOwn(message, 'result')) sawResult = true;
    } catch { return true; }
  }
  return !sawResult;
}
