import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { recordAgentObservation } from '@/lib/server/services/agent-analytics';

const { fetchMcp } = vi.hoisted(() => ({ fetchMcp: vi.fn() }));
vi.mock('@/lib/server/agent/mcp', () => ({ createPublicMcpHandler: () => ({ fetch: fetchMcp }) }));
vi.mock('@/lib/server/services/agent-analytics', () => ({
  recordAgentObservation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/observability/logger', () => ({ logger: { info: vi.fn() } }));

import { POST } from '@/app/api/agent/mcp/route';
import { logger } from '@/lib/observability/logger';
import { __resetPublicAgentBudgetForTest } from '../public-guard';
import { __resetAgentDiscoveryEventsForTest } from '../discovery-events';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('NEXT_PUBLIC_BUYER_ORIGIN', 'http://localhost:3000');
  vi.stubEnv('NEXT_PUBLIC_PARTNER_ORIGIN', 'http://localhost:3001');
  vi.clearAllMocks();
  vi.mocked(recordAgentObservation).mockReset().mockResolvedValue(undefined);
  __resetPublicAgentBudgetForTest();
  __resetAgentDiscoveryEventsForTest();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it.each(['handler', 'response'] as const)('aborts a stalled %s and logs one failed exchange', async stalled => {
  fetchMcp.mockImplementationOnce((request: Request) => {
    if (stalled === 'handler') return new Promise(() => {});
    return Promise.resolve(new Response(new ReadableStream({
      start(controller) {
        request.signal.addEventListener('abort', () => controller.close(), { once: true });
      },
    }), { headers: { 'Content-Type': 'text/event-stream' } }));
  });
  const pending = POST(new Request('http://localhost:3000/api/agent/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }));
  await vi.advanceTimersByTimeAsync(5_001);
  const response = await pending;
  expect(response.status).toBe(503);
  expect(fetchMcp.mock.calls[0][0].signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(1);
  expect(logger.info).toHaveBeenCalledTimes(1);
  expect(logger.info).toHaveBeenCalledWith('agent.discovery', expect.objectContaining({ operation: 'tools_list', outcome: 'error' }));
});
