import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureFirstTouch, readFirstTouch } from '../first-touch';

function setLocation(href: string, referrer = '') {
  const url = new URL(href);
  Object.defineProperty(window, 'location', {
    value: {
      href: url.href,
      pathname: url.pathname,
      search: url.search,
      hostname: url.hostname,
      host: url.host,
    },
    writable: true,
  });
  Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
}

describe('first-touch attribution capture', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures utm params and external referrer on first visit', () => {
    setLocation(
      'https://support-b.com/?utm_source=google&utm_medium=cpc&utm_campaign=brand',
      'https://google.com/search',
    );
    captureFirstTouch();
    const stored = readFirstTouch();
    expect(stored?.utmSource).toBe('google');
    expect(stored?.utmMedium).toBe('cpc');
    expect(stored?.utmCampaign).toBe('brand');
    expect(stored?.referrer).toBe('https://google.com/search');
    expect(stored?.landingPath).toBe('/?utm_source=google&utm_medium=cpc&utm_campaign=brand');
    expect(stored?.capturedAt).toEqual(expect.any(String));
  });

  it('ignores an internal referrer (same host)', () => {
    setLocation('https://support-b.com/rfp', 'https://support-b.com/home');
    captureFirstTouch();
    expect(readFirstTouch()?.referrer).toBeUndefined();
  });

  it('records landingPath even with no utm/referrer at all', () => {
    setLocation('https://support-b.com/opportunities', '');
    captureFirstTouch();
    const stored = readFirstTouch();
    expect(stored?.landingPath).toBe('/opportunities');
    expect(stored?._v).toBe(1);
  });

  it('is write-once: a second capture does not overwrite the first', () => {
    setLocation('https://support-b.com/?utm_source=google', 'https://google.com');
    captureFirstTouch();
    setLocation('https://support-b.com/?utm_source=naver', 'https://naver.com');
    captureFirstTouch();
    expect(readFirstTouch()?.utmSource).toBe('google');
  });

  it('readFirstTouch returns null when nothing captured yet', () => {
    expect(readFirstTouch()).toBeNull();
  });

  it('fails safely when localStorage is unavailable', () => {
    const spy = vi
      .spyOn(window.localStorage.__proto__, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    setLocation('https://support-b.com/?utm_source=google', '');
    expect(() => captureFirstTouch()).not.toThrow();
    spy.mockRestore();
  });
});
