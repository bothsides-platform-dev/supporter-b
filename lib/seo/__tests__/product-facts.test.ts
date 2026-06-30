import { describe, it, expect } from 'vitest';
import { HERO_METRICS } from '@/components/landing/hero-metrics';
import { audienceFacts } from '@/lib/seo/product-facts';

describe('hero-metrics drift guard', () => {
  it('HERO_METRICS captions match BUYER_FACTS.metrics captions exactly', () => {
    const heroCaptions = HERO_METRICS.map((m) => m.caption);
    const seoCaptions = audienceFacts('buyer').metrics!.map((m) => m.caption);
    expect(heroCaptions).toEqual(seoCaptions);
  });

  it('HERO_METRICS count matches BUYER_FACTS.metrics count', () => {
    expect(HERO_METRICS.length).toBe(audienceFacts('buyer').metrics!.length);
  });
});
