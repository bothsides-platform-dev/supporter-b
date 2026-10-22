// @vitest-environment-options {"url":"https://support-b.com"}
import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FirstTouchCapture } from '../FirstTouchCapture';
import { readFirstTouch } from '@/lib/attribution/first-touch';
import { funnelAnalytics } from '@/lib/analytics/funnel';
const send = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics/funnel', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/analytics/funnel')>();
  return { ...original, funnelAnalytics: original.createFunnelAnalytics({ production: true, send, storage: () => localStorage }) };
});
const url = '/signup/buyer?utm_source=naver&keep=1&sb_via=docs&sb_docs_path=%2Fglossary%2Fpg&sb_docs_placement=header_cta&sb_docs_source=naver&sb_docs_medium=organic#start';
beforeEach(() => { localStorage.clear(); send.mockClear(); window.history.replaceState({ existing: true }, '', url); });
afterEach(() => vi.restoreAllMocks());
it('consumes docs parameters before first-touch capture and survives Strict Mode without duplicate arrivals', () => {
  render(<StrictMode><FirstTouchCapture /></StrictMode>);
  expect(window.location.search).toBe('?utm_source=naver&keep=1');
  expect(window.location.hash).toBe('#start'); expect(window.history.state).toEqual({ existing: true });
  expect(readFirstTouch()).toMatchObject({ utmSource: 'naver', landingPath: '/signup/buyer?utm_source=naver&keep=1' });
  funnelAnalytics.configure('G-TEST'); funnelAnalytics.identify(null);
  expect(send.mock.calls.filter(c => c[1] === 'docs_main_arrival')).toHaveLength(1);
});
it('a history failure never prevents first-touch capture or rendering', () => {
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => { throw Error('blocked'); });
  expect(() => render(<FirstTouchCapture />)).not.toThrow();
  expect(readFirstTouch()?.utmSource).toBe('naver');
  expect(readFirstTouch()?.landingPath).toBe('/signup/buyer?utm_source=naver&keep=1');
});
