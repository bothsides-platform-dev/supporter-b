import { vi, describe, it, expect } from 'vitest';
import type { Metadata } from 'next';

vi.mock('next/font/local', () => ({
  default: () => ({ variable: '--font-test', className: '' }),
}));
vi.mock('next-axiom', () => ({ AxiomWebVitals: () => null }));
vi.mock('@/lib/site-config', () => ({
  siteConfig: {
    url: 'https://supporter-b.com',
    title: 'Supporter B',
    description: 'Test',
    name: 'Supporter B',
    locale: 'ko_KR',
    keywords: [],
    ogImageAlt: 'Test',
  },
}));
vi.mock('@/lib/channel-io/server', () => ({ getChannelMember: async () => null }));
vi.mock('@/components/shell/ChannelTalk', () => ({ ChannelTalk: () => null }));
vi.mock('@/components/shell/Analytics', () => ({ Analytics: () => null }));
vi.mock('../globals.css', () => ({}));

const { metadata } = await import('../layout');

describe('root layout metadata', () => {
  it('declares /llms.txt as a text/plain alternate link for LLM auto-discovery', () => {
    const alternates = (metadata as Metadata).alternates as {
      canonical?: string;
      types?: Record<string, string>;
    };
    expect(alternates?.types?.['text/plain']).toBe('/llms.txt');
  });

  it('still has canonical "/" alternate', () => {
    const alternates = (metadata as Metadata).alternates as {
      canonical?: string;
    };
    expect(alternates?.canonical).toBe('/');
  });
});
