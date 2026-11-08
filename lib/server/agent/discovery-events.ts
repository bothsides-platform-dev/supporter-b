import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { logger } from '@/lib/observability/logger';
import { AGENT_CATALOG_VERSION, PG_CONSULTATION_ID } from './catalog';

export const AGENT_DISCOVERY_SCHEMA_VERSION = 1;
export const MAX_DISCOVERY_EVENTS_PER_MINUTE = 2_400;

// Only server-observed discovery activity belongs here. Tool output is not proof
// of a displayed recommendation, a new customer, an application, or a contract.
export const agentDiscoveryObservationSchema = z.object({
  surface: z.enum(['rest', 'mcp', 'guide']),
  operation: z.enum([
    'catalog', 'requirements', 'guide', 'tools_list', 'tool_call',
    'resources_list', 'resource_templates_list', 'resource_read',
    'initialize', 'ping', 'notification', 'unknown',
  ]),
  outcome: z.enum(['ok', 'invalid_request', 'unsupported_service', 'rejected', 'rate_limited', 'error']),
  serviceId: z.literal(PG_CONSULTATION_ID).optional(),
  durationMs: z.number().finite().nonnegative().max(3_600_000),
  // Passed from our catalog constant, never copied from a request parameter.
  catalogVersion: z.literal(AGENT_CATALOG_VERSION),
  clientKind: z.enum(['unknown', 'claude_code', 'codex']).default('unknown'),
}).strict();

export type AgentDiscoveryObservation = z.input<typeof agentDiscoveryObservationSchema>;

export const agentDiscoveryEventSchema = agentDiscoveryObservationSchema.extend({
  schemaVersion: z.literal(AGENT_DISCOVERY_SCHEMA_VERSION),
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  // Client identity is a claim, not authenticated attribution or model identity.
  clientKindReliability: z.literal('reported'),
}).strict();

export type AgentDiscoveryEvent = z.output<typeof agentDiscoveryEventSchema>;

export function buildAgentDiscoveryEvent(
  input: AgentDiscoveryObservation,
  metadata?: { eventId: string; occurredAt: string },
): AgentDiscoveryEvent {
  const observation = agentDiscoveryObservationSchema.parse(input);
  return agentDiscoveryEventSchema.parse({
    ...observation,
    schemaVersion: AGENT_DISCOVERY_SCHEMA_VERSION,
    eventId: metadata?.eventId ?? randomUUID(),
    occurredAt: metadata?.occurredAt ?? new Date().toISOString(),
    clientKindReliability: 'reported',
  });
}

let windowStart: number | undefined;
let recorded = 0;

function admitEvent(): boolean {
  const now = Date.now();
  if (windowStart === undefined || now < windowStart || now - windowStart >= 60_000) {
    windowStart = now;
    recorded = 0;
  }
  if (recorded >= MAX_DISCOVERY_EVENTS_PER_MINUTE) return false;
  recorded += 1;
  return true;
}

/** Best-effort observation; invalid input or logging failure never breaks a request. */
export function recordAgentDiscoveryEvent(input: AgentDiscoveryObservation): AgentDiscoveryEvent | null {
  try {
    const event = buildAgentDiscoveryEvent(input);
    // Also bound rejected-request logs: their traffic may never enter the normal
    // request budget. Never log the rejected payload to explain a schema failure.
    if (!admitEvent()) return null;
    logger.info('agent.discovery', event);
    return event;
  } catch {
    return null;
  }
}

export function __resetAgentDiscoveryEventsForTest(): void {
  windowStart = undefined;
  recorded = 0;
}
