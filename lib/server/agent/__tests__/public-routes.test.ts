import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as catalog } from '@/app/api/agent/v1/services/route';
import { GET as requirements } from '@/app/api/agent/v1/services/[serviceId]/requirements/route';
import { GET as guide } from '@/app/developers/agents.md/route';
import { logger } from '@/lib/observability/logger';
import { decideRoute } from '@/lib/auth/route-decision';
import { __resetPublicAgentBudgetForTest } from '../public-guard';
import { __resetAgentDiscoveryEventsForTest } from '../discovery-events';
import { AGENT_CATALOG_VERSION, getPublicRequirements } from '../catalog';

vi.mock('@/lib/observability/logger', () => ({ logger: { info: vi.fn() } }));

const origin = 'https://support-b.test';
const context = (serviceId = 'pg-consultation') => ({ params: Promise.resolve({ serviceId }) });
const request = (path: string) => new Request(`${origin}${path}`);

beforeEach(() => {
  vi.stubEnv('AGENT_ACCOUNT_CHANNEL_ENABLED', 'false');
  vi.stubEnv('NEXT_PUBLIC_BUYER_ORIGIN', origin);
  vi.stubEnv('NEXT_PUBLIC_PARTNER_ORIGIN', 'https://partner.support-b.test');
  vi.mocked(logger.info).mockReset();
  __resetPublicAgentBudgetForTest();
  __resetAgentDiscoveryEventsForTest();
});
afterEach(() => vi.unstubAllEnvs());

describe('public B2A reads', () => {
  it('returns a finite public catalog with canonical links and explicit current availability', async () => {
    const response = await catalog(request('/api/agent/v1/services'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.catalogVersion).toBe(AGENT_CATALOG_VERSION);
    expect(body.services).toHaveLength(1);
    expect(body.services[0]).toMatchObject({
      id: 'pg-consultation',
      availability: { agentSubmission: false, unifiedSdk: false, quote: 'subject_to_partner_review' },
      contracts: { serviceParties: '고객과 선정 PG사' },
    });
    expect(body.links.mcp).toBe(`${origin}/api/agent/mcp`);
    expect(body.services[0].requirementsUrl).toBe(`${origin}/api/agent/v1/services/pg-consultation/requirements`);
    for (const key of ['workspaceId', 'bids', 'competitorCount', 'hidden_from_pg', 'currentCardRate']) {
      expect(JSON.stringify(body)).not.toContain(`"${key}"`);
    }
    expect(logger.info).toHaveBeenCalledWith('agent.discovery', expect.objectContaining({ surface: 'rest', operation: 'catalog', outcome: 'ok' }));
  });

  it('uses real preparation rules: only switching asks for current providers and prior PG volume', async () => {
    const initial = await requirements(request('/requirements'), context());
    const switching = await requirements(request('/requirements?contractType=renewal'), context());
    expect((await initial.json()).questions).toEqual(getPublicRequirements('new').questions);
    const newKeys = getPublicRequirements('new').questions.map(q => q.key);
    const renewalKeys = (await switching.json()).questions.map((q: { key: string }) => q.key);
    expect(newKeys).not.toContain('current-pgs');
    expect(newKeys).not.toContain('monthly-avg-volume');
    expect(renewalKeys).toContain('current-pgs');
    expect(renewalKeys).toContain('monthly-avg-volume');
    for (const key of ['website-required', 'industry', 'product-cash', 'product-price', 'product-sales', 'payment', 'pg']) {
      expect(newKeys).toContain(key);
    }
  });

  it('rejects unsupported services and ambiguous contract types without echoing input', async () => {
    const unknown = await requirements(request('/requirements'), context('private-customer@example.test'));
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).not.toContain('private-customer');
    for (const query of ['contractType=invalid', 'contractType=', 'contractType=new&contractType=renewal']) {
      expect((await requirements(request(`/requirements?${query}`), context())).status).toBe(400);
    }
    const logs = JSON.stringify(vi.mocked(logger.info).mock.calls);
    expect(logs).not.toContain('private-customer');
    expect(logs).toContain('unsupported_service');
  });

  it('publishes an anonymous Markdown guide with truthful tools and contract boundaries', async () => {
    const response = await guide(request('/developers/agents.md'));
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    const text = await response.text();
    expect(text).toContain(`claude mcp add --transport http support-b ${origin}/api/agent/mcp`);
    expect(text).toContain(`codex mcp add support-b --url ${origin}/api/agent/mcp`);
    expect(text).toContain('아직 제공하지 않아요');
    expect(text).toContain('실제 상담 신청은 웹');
    expect(text).toContain('노온–구매사');
    expect(text).toContain('별개');
    expect(text).toContain('추천했거나 계약했다고 계산하지 않아요');
    expect(decideRoute('/developers/agents.md', '', false)).toEqual({ kind: 'next' });
    expect(decideRoute('/developers/agents.md', '', true)).toEqual({ kind: 'next' });
    for (const path of ['/developers', '/developers/agents.md/private', '/developers/agentsXmd']) {
      expect(decideRoute(path, '', false).kind).toBe('redirect');
    }
  });

  it.each(['https://partner.support-b.test', 'https://unknown.test'])('closes every public surface on %s', async host => {
    for (const response of [
      await catalog(new Request(`${host}/api/agent/v1/services`)),
      await guide(new Request(`${host}/developers/agents.md`)),
      await requirements(new Request(`${host}/requirements`), context()),
    ]) {
      expect(response.status).toBe(404);
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(await response.text()).not.toContain('pg-consultation');
    }
  });

  it('keeps public reads working if the analytics sink throws', async () => {
    vi.mocked(logger.info).mockImplementationOnce(() => { throw new Error('unavailable'); });
    expect((await catalog(request('/api/agent/v1/services'))).status).toBe(200);
  });
});

it('advertises the account channel only when enabled', async () => {
  expect((await (await catalog(request('/api/agent/v1/services'))).json()).accountChannel).toBeNull();
  vi.stubEnv('AGENT_ACCOUNT_CHANNEL_ENABLED', 'true');
  expect((await (await catalog(request('/api/agent/v1/services'))).json()).accountChannel).toMatchObject({ finalSubmission: 'human_browser_confirmation' });
  expect(await (await guide(request('/developers/agents.md'))).text()).toContain('codex mcp login support-b-account');
  for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource/api/agent/account/mcp']) {
    expect(decideRoute(path, '', false)).toEqual({ kind: 'next' });
    expect(decideRoute(`${path}/private`, '', false).kind).toBe('redirect');
  }
});
