import { afterEach, expect, it, vi } from 'vitest';

// funnel.test.ts injects `send`. These tests keep the real dataLayer transport, the seam gtag.js reads.
type GtagWindow = Window & { dataLayer?: ArrayLike<unknown>[] };
const page = () => window as GtagWindow;
const commands = () => (page().dataLayer ?? []).map(args => args[0]);
async function loadSite() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.resetModules();
  const { funnelAnalytics } = await import('../funnel');
  funnelAnalytics.configure('G-TEST');
  return funnelAnalytics;
}
afterEach(() => {
  delete page().dataLayer;
  vi.unstubAllEnvs();
});

it('starts gtag when gtag.js created the dataLayer before the session resolved', async () => {
  page().dataLayer = [];
  (await loadSite()).identify(null);
  expect(commands()).toEqual(['js', 'config']);
});

it('starts gtag only once when it creates the dataLayer itself', async () => {
  const analytics = await loadSite();
  analytics.identify(null);
  analytics.identify({ id: 'buyer', workspaceType: 'buyer' });
  expect(commands()).toEqual(['js', 'config', 'config']);
});

// gtag sends automatic events (user_engagement, scroll) by itself. Only this flag stops them.
const disabled = () => (window as unknown as Record<string, unknown>)['ga-disable-G-TEST'];

it.each([{ workspaceType: 'pg' }, { workspaceType: 'buyer', isMaster: true }])('switches GA off before configuring an excluded account %j', async user => {
  let disabledAtConfig: unknown;
  const queue: ArrayLike<unknown>[] = [];
  queue.push = (...items) => {
    if (items[0][0] === 'config') disabledAtConfig = disabled();
    return Array.prototype.push.apply(queue, items);
  };
  page().dataLayer = queue;
  (await loadSite()).identify(user);
  expect(disabledAtConfig).toBe(true);
});

it('follows identity changes inside one document', async () => {
  const analytics = await loadSite();
  const buyer = { id: 'buyer', workspaceType: 'buyer' };
  const pg = { id: 'pg', workspaceType: 'pg' };
  const states = [buyer, pg, null, pg, buyer].map(user => { analytics.identify(user); return disabled(); });
  expect(states).toEqual([false, true, false, true, false]);
});

it.each(['https://partner.support-b.com/', 'https://partner.support-b.com/login', 'https://support-b.com/demo', 'https://support-b.com/tutorial/rfp'])('switches GA off for a visitor on an excluded surface %s', async location => {
  const analytics = await loadSite();
  analytics.configure('G-TEST', location);
  analytics.identify(null);
  expect(disabled()).toBe(true);
});

it('turns GA back on after leaving the demo and keeps the buyer User-ID', async () => {
  const analytics = await loadSite();
  const visit = (location: string) => {
    analytics.configure('G-TEST', location);
    analytics.identify({ id: 'buyer', workspaceType: 'buyer' });
    return disabled();
  };
  expect([visit('https://support-b.com/demo'), visit('https://support-b.com/'), visit('https://support-b.com/demo-day')]).toEqual([true, false, false]);
  expect(page().dataLayer!.filter(args => args[0] === 'config').map(args => args[2])).toEqual([expect.objectContaining({ user_id: 'buyer' })]);
});
