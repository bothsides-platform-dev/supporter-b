import { describe, it, expect } from 'vitest';
import { HERO_METRICS } from '@/components/landing/hero-metrics';
import { audienceFacts } from '@/lib/seo/product-facts';
import { CUSTOMER_TYPES, PROCESS_STEPS } from '@/components/landing/pg-landing-data';
import { getGlossaryEntry } from '@/lib/glossary';

describe('가입비 wording', () => {
  it('uses 가입비 in published product copy and its explanation', () => {
    const copy = JSON.stringify({
      buyer: audienceFacts('buyer'),
      pg: audienceFacts('pg'),
      pgLanding: { customerTypes: CUSTOMER_TYPES, processSteps: PROCESS_STEPS },
      explanation: getGlossaryEntry('가입비'),
    });

    expect(copy).toContain('가입비');
    expect(copy).not.toContain('셋업비');
  });
});

describe('hero-metrics drift guard', () => {
  it('HERO_METRICS captions match BUYER_FACTS.metrics captions exactly', () => {
    const heroCaptions = HERO_METRICS.map((m) => m.caption);
    const seoCaptions = audienceFacts('buyer').metrics!.map((m) => m.caption);
    expect(heroCaptions).toEqual(seoCaptions);
  });

  it('HERO_METRICS count matches BUYER_FACTS.metrics count', () => {
    expect(HERO_METRICS.length).toBe(audienceFacts('buyer').metrics!.length);
  });

  it('HERO_METRICS formatted values match BUYER_FACTS.metrics value strings', () => {
    const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const heroValues = [...HERO_METRICS].map((m) => {
      const num = m.decimals === 0 ? fmt.format(m.to) : m.to.toFixed(m.decimals);
      return `${num}${m.unit}`;
    });
    const seoValues = audienceFacts('buyer').metrics!.map((m) => m.value);
    expect(heroValues).toEqual(seoValues);
  });
});
