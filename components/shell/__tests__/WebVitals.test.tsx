import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

// The vendor reporter registers web-vitals observers (absent in jsdom). Replace only the
// factory so the test can see whether our component mounts it; the transport that ships
// batches to /api/axiom stays real.
const reporterMounted = vi.fn();
vi.mock('@axiomhq/react', () => ({
  createWebVitalsComponent: () =>
    function Reporter() {
      reporterMounted();
      return null;
    },
}));

const { WebVitals, webVitalsLogger } = await import('../WebVitals');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  reporterMounted.mockReset();
});

describe('WebVitals', () => {
  it('does not start web-vitals reporting in development', () => {
    vi.stubEnv('NODE_ENV', 'development');

    render(<WebVitals />);

    expect(reporterMounted).not.toHaveBeenCalled();
  });

  it('starts web-vitals reporting outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');

    render(<WebVitals />);

    expect(reporterMounted).toHaveBeenCalled();
  });

  it('ships batched events to the /api/axiom relay as a JSON array', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    webVitalsLogger.raw({ source: 'web-vital', webVital: { name: 'LCP', value: 1200 } });
    await webVitalsLogger.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/axiom');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual([
      { source: 'web-vital', webVital: { name: 'LCP', value: 1200 } },
    ]);
  });
});
