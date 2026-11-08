import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/lib/observability/logger';
import { AGENT_CATALOG_VERSION } from '../catalog';
import {
  agentDiscoveryEventSchema,
  buildAgentDiscoveryEvent,
  recordAgentDiscoveryEvent,
  MAX_DISCOVERY_EVENTS_PER_MINUTE,
  __resetAgentDiscoveryEventsForTest,
  type AgentDiscoveryObservation,
} from '../discovery-events';

vi.mock('@/lib/observability/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function observation(): AgentDiscoveryObservation {
  return {
    surface: 'mcp', operation: 'catalog', outcome: 'ok', durationMs: 12.5,
    serviceId: 'pg-consultation', catalogVersion: AGENT_CATALOG_VERSION,
    clientKind: 'codex',
  };
}

beforeEach(() => {
  vi.mocked(logger.info).mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-08T01:02:03Z'));
  __resetAgentDiscoveryEventsForTest();
});

afterEach(() => vi.useRealTimers());

describe('discovery event contract', () => {
  it('creates server identity and records only the fixed observation shape', () => {
    const event = recordAgentDiscoveryEvent(observation());
    expect(event).toEqual({
      ...observation(),
      schemaVersion: 1,
      eventId: expect.any(String),
      occurredAt: '2026-11-08T01:02:03.000Z',
      clientKindReliability: 'reported',
    });
    expect(agentDiscoveryEventSchema.safeParse(event).success).toBe(true);
    expect(logger.info).toHaveBeenCalledWith('agent.discovery', event);
    expect(recordAgentDiscoveryEvent(observation())?.eventId).not.toBe(event?.eventId);
  });

  it('defaults absent client identity to unknown without inferring a model or person', () => {
    const input = observation();
    delete input.clientKind;
    expect(buildAgentDiscoveryEvent(input)).toMatchObject({ clientKind: 'unknown', clientKindReliability: 'reported' });
  });

  it.each([
    { prompt: 'private conversation' },
    { clientInfo: { name: 'person@example.test' } },
    { authorization: 'Bearer private-token' },
    { referrer: 'https://example.test/?email=person@example.test' },
    { eventId: 'client-chosen-id' },
    { occurredAt: '2020-01-01T00:00:00Z' },
  ])('rejects extra input without logging any of it: %j', extra => {
    expect(recordAgentDiscoveryEvent({ ...observation(), ...extra })).toBeNull();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it.each([
    { operation: 'recommendation_shown' },
    { outcome: 'contract_confirmed' },
    { serviceId: 'unknown-private-request' },
    { clientKind: 'person@example.test' },
    { catalogVersion: 'request-supplied-version' },
    { durationMs: Number.NaN },
    { durationMs: Number.POSITIVE_INFINITY },
    { durationMs: -1 },
  ])('rejects misleading or unbounded observations: %j', invalid => {
    expect(recordAgentDiscoveryEvent({ ...observation(), ...invalid } as AgentDiscoveryObservation)).toBeNull();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('allows an unsupported service outcome without retaining the raw requested identifier', () => {
    const input = observation();
    delete input.serviceId;
    expect(recordAgentDiscoveryEvent({ ...input, operation: 'requirements', outcome: 'unsupported_service' })).not.toHaveProperty('serviceId');
  });

  it('cannot accidentally accept unknown fields in stored events either', () => {
    const event = buildAgentDiscoveryEvent(observation());
    expect(agentDiscoveryEventSchema.safeParse({ ...event, body: { email: 'person@example.test' } }).success).toBe(false);
  });

  it('does not make the instrumented request fail if the log transport throws', () => {
    vi.mocked(logger.info).mockImplementationOnce(() => { throw new Error('transport unavailable'); });
    expect(recordAgentDiscoveryEvent(observation())).toBeNull();
  });

  it('bounds rejected-request log volume and recovers in the next window', () => {
    const input = { ...observation(), outcome: 'rejected' as const };
    for (let i = 0; i < MAX_DISCOVERY_EVENTS_PER_MINUTE; i++) {
      expect(recordAgentDiscoveryEvent(input)).not.toBeNull();
    }
    expect(recordAgentDiscoveryEvent(input)).toBeNull();
    expect(logger.info).toHaveBeenCalledTimes(MAX_DISCOVERY_EVENTS_PER_MINUTE);
    vi.advanceTimersByTime(60_000);
    expect(recordAgentDiscoveryEvent(input)).not.toBeNull();
  });
});
