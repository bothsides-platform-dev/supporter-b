import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createFunnelAnalytics } from '../funnel';

const arrival = 'https://support-b.com/signup/buyer?keep=yes&utm_source=naver&utm_medium=paid&sb_via=docs&sb_docs_path=%2Farticles%2Fpg-launch-timeline&sb_docs_placement=article_body&sb_docs_source=naver&sb_docs_medium=paid#start';
const fields = { docs_assisted: 'true', docs_path: '/articles/pg-launch-timeline', docs_placement: 'article_body', docs_source: 'naver', docs_medium: 'paid' };
const send = vi.fn();
const create = () => createFunnelAnalytics({ production: true, send, storage: () => localStorage });
const signup = (a: ReturnType<typeof create>, key = 'signup') => a.track('sign_up', { funnel_id: 'signup', step_id: 'account_created' }, '/signup/buyer/profile', key);
beforeEach(() => { localStorage.clear(); send.mockClear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-22T00:00:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('captures a docs arrival independently of first touch, cleans only protocol parameters and waits for identity', () => {
  localStorage.setItem('bidit.firstTouch', 'original');
  const a = create();
  expect(a.docsArrival(arrival)).toBe('https://support-b.com/signup/buyer?keep=yes&utm_source=naver&utm_medium=paid#start');
  a.configure('G-TEST', arrival); expect(send).not.toHaveBeenCalled(); a.identify(null);
  expect(send.mock.calls.filter(c => c[1] === 'docs_main_arrival')).toEqual([
    ['event', 'docs_main_arrival', expect.objectContaining(fields)],
  ]);
  expect(localStorage.getItem('bidit.firstTouch')).toBe('original');
  signup(a); expect(send.mock.calls.at(-1)?.[2]).toMatchObject(fields);
});

it('reload and ordinary visits do not emit arrivals or extend the 30-day boundary', () => {
  const a = create(); const clean = a.docsArrival(arrival); a.configure('G-TEST'); a.identify(null);
  a.docsArrival(arrival); // Strict Mode replay / a failed history replacement.
  vi.advanceTimersByTime(29 * 86400000);
  const b = create(); b.docsArrival(clean); b.configure('G-TEST'); b.identify(null); signup(b, 'day29');
  expect(send.mock.calls.at(-1)?.[2]).toMatchObject(fields);
  vi.advanceTimersByTime(86400000 - 1); signup(b, 'before-expiry');
  expect(send.mock.calls.at(-1)?.[2]).toMatchObject(fields);
  vi.advanceTimersByTime(1); signup(b, 'at-expiry');
  expect(send.mock.calls.at(-1)?.[2]).toMatchObject({ docs_assisted: 'false', docs_path: 'unknown' });
  expect(send.mock.calls.filter(c => c[1] === 'docs_main_arrival')).toHaveLength(1);
});

it('a later docs visit replaces the document and renews only from actual arrival', () => {
  const a = create(); a.docsArrival(arrival);
  vi.advanceTimersByTime(29 * 86400000);
  const b = create(); b.docsArrival(arrival.replace('%2Farticles%2Fpg-launch-timeline', '%2Fglossary%2Fpg').replace('article_body', 'header_cta'));
  vi.advanceTimersByTime(2 * 86400000);
  a.configure('G-TEST'); a.identify(null); signup(a);
  expect(send.mock.calls.at(-1)?.[2]).toMatchObject({ ...fields, docs_path: '/glossary/pg', docs_placement: 'header_cta' });
});

it('rejects incomplete or duplicated protocol and excludes partner-host arrivals', () => {
  for (const url of [arrival.replace('sb_via=docs', 'sb_via=other'), arrival.replace('sb_docs_placement=article_body', 'sb_docs_placement=private-name'), arrival + '&sb_via=docs', arrival.replace('sb_docs_path=', 'missing='), arrival.replace('support-b.com/', 'partner.support-b.com/')]) {
    const a = create(); a.docsArrival(url.replace('#start', '')); a.configure('G-TEST'); a.identify(null);
  }
  expect(send.mock.calls.filter(c => c[1] === 'docs_main_arrival')).toHaveLength(0);
});

it('strips queries and hashes from docs paths and drops arbitrary source/medium values', () => {
  const a = create(); a.docsArrival(arrival.replace('%2Farticles%2Fpg-launch-timeline', '%2Fglossary%2Fpg%3Femail%3Dsecret%23secret').replace('sb_docs_source=naver', 'sb_docs_source=private@example.com').replace('sb_docs_medium=paid', 'sb_docs_medium=secret'));
  a.configure('G-TEST'); a.identify(null);
  expect(send.mock.calls.at(-1)?.[2]).toMatchObject({ docs_path: '/glossary/pg', docs_source: 'unknown', docs_medium: 'unknown' });
  expect(JSON.stringify(send.mock.calls)).not.toMatch(/secret|private@example/);
});

it('keeps arrival and success tracking safe when storage or transport throws', () => {
  const a = createFunnelAnalytics({ production: true, send, storage: () => { throw Error('blocked'); } });
  expect(() => a.docsArrival(arrival)).not.toThrow(); a.configure('G-TEST'); a.identify(null); signup(a);
  expect(send.mock.calls.at(-1)?.[2]).toMatchObject(fields);
  send.mockImplementation(() => { throw Error('blocked'); });
  expect(() => signup(a, 'another')).not.toThrow(); send.mockReset();
});

it('both conversion events keep deduplication, including re-instantiation', () => {
  for (let i = 0; i < 2; i++) {
    const a = create(); if (!i) a.docsArrival(arrival); a.configure('G-TEST'); a.identify({ id: 'buyer', workspaceType: 'buyer' });
    signup(a); signup(a);
    for (let j = 0; j < 2; j++) a.track('quote_request_submitted', { funnel_id: 'request', step_id: 'submitted' }, '/rfp-create', 'request');
  }
  for (const name of ['sign_up', 'quote_request_submitted']) {
    const events = send.mock.calls.filter(c => c[1] === name); expect(events).toHaveLength(1); expect(events[0][2]).toMatchObject(fields);
  }
});

it.each(['meta', 'docs'])('accepts generator source %s and all generator mediums', source => {
  const a = create(); a.configure('G-TEST'); a.identify(null);
  for (const medium of ['paid', 'owned', 'earned']) {
    a.pageView(`/?utm_source=${source}&utm_medium=${medium}`);
    expect(send.mock.calls.at(-1)?.[2]).toMatchObject({ campaign_source: source, campaign_medium: medium });
  }
});
