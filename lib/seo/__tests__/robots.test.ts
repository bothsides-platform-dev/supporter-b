import { describe, it, expect } from 'vitest';
import { buildRobots, AI_CRAWLER_USER_AGENTS } from '@/lib/seo/robots';

const ORIGIN = 'https://partner.supporter-b.com';

describe('buildRobots', () => {
  it('points host + sitemap at the given origin (host-aware)', () => {
    const r = buildRobots(ORIGIN);
    expect(r.host).toBe(ORIGIN);
    expect(r.sitemap).toBe(`${ORIGIN}/sitemap.xml`);
  });

  it('keeps the wildcard rule allowing public and blocking app routes', () => {
    const r = buildRobots(ORIGIN);
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const wildcard = rules.find((rule) => rule?.userAgent === '*');
    expect(wildcard).toBeDefined();
    expect(wildcard?.allow).toContain('/');
    expect(wildcard?.disallow).toContain('/api/');
    expect(wildcard?.disallow).toContain('/home');
  });

  it('explicitly welcomes the major AI crawlers but still blocks app routes', () => {
    const r = buildRobots(ORIGIN);
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const aiRule = rules.find((rule) => {
      const ua = rule?.userAgent;
      return Array.isArray(ua) && ua.includes('GPTBot');
    });
    expect(aiRule).toBeDefined();
    for (const bot of AI_CRAWLER_USER_AGENTS) {
      expect(aiRule?.userAgent).toContain(bot);
    }
    expect(aiRule?.allow).toContain('/');
    expect(aiRule?.disallow).toContain('/home');
    expect(aiRule?.disallow).toContain('/api/');
  });

  it('covers the key answer + training crawlers', () => {
    expect(AI_CRAWLER_USER_AGENTS).toEqual(
      expect.arrayContaining([
        'GPTBot',
        'OAI-SearchBot',
        'ChatGPT-User',
        'ClaudeBot',
        'Claude-SearchBot',
        'PerplexityBot',
        'Google-Extended',
        'Applebot-Extended',
      ]),
    );
  });
});
