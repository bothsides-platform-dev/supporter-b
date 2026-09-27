import { beforeEach, describe, expect, it, vi } from 'vitest';

const { status, fetchOfficialYear, warn, captureException } = vi.hoisted(() => ({
  status: vi.fn(), fetchOfficialYear: vi.fn(), warn: vi.fn(), captureException: vi.fn(),
}));
vi.mock('@/lib/server/repositories/factory', () => ({
  getBusinessCalendarRepo: async () => ({ status }),
  getDb: vi.fn(),
}));
vi.mock('@/lib/server/calendar/official', () => ({ fetchOfficialYear }));
vi.mock('@/lib/observability/logger', () => ({ logger: { warn } }));
vi.mock('@sentry/nextjs', () => ({ captureException }));

import { checkBusinessCalendarCoverage, runBusinessCalendarSync } from '../business-calendar-sync';

describe('calendar sync failure health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BUSINESS_CALENDAR_API_KEY', 'key');
    status.mockResolvedValue([{ year: 2026, fetchedAt: new Date('2026-09-23T00:00:00Z'), version: 'old' }]);
    fetchOfficialYear.mockRejectedValue(new Error('HOLIDAY_API_UNAVAILABLE'));
  });
  it('warns about stale and missing last-good years when the provider fails', async () => {
    await expect(runBusinessCalendarSync(new Date('2026-12-20T03:00:00Z'))).rejects.toThrow('HOLIDAY_API_UNAVAILABLE');
    expect(warn).toHaveBeenCalledWith('calendar.sync_health', { staleYears: [2026], missingYears: [2027] });
    expect(captureException).toHaveBeenCalled();
  });
  it('checks last-good coverage even when the API key is absent', async () => {
    vi.stubEnv('BUSINESS_CALENDAR_API_KEY', '');
    await expect(runBusinessCalendarSync(new Date('2026-12-20T03:00:00Z'))).rejects.toThrow('BUSINESS_CALENDAR_API_KEY_MISSING');
    expect(warn).toHaveBeenCalledWith('calendar.sync_health', { staleYears: [2026], missingYears: [2027] });
    expect(fetchOfficialYear).not.toHaveBeenCalled();
  });
});

describe('deploy coverage gate', () => {
  beforeEach(() => vi.clearAllMocks());
  it('reports the years the app needs but the database lacks, without calling the provider', async () => {
    status.mockResolvedValue([{ year: 2026, fetchedAt: new Date('2026-12-19T00:00:00Z'), version: 'v1' }]);
    expect(await checkBusinessCalendarCoverage(new Date('2026-12-20T03:00:00Z'))).toEqual({ missingYears: [2027] });
    expect(status).toHaveBeenCalledWith([2026, 2027]);
    expect(fetchOfficialYear).not.toHaveBeenCalled();
  });
  it('passes when every needed year is loaded', async () => {
    status.mockResolvedValue([{ year: 2026, fetchedAt: new Date('2026-09-26T00:00:00Z'), version: 'v1' }]);
    expect(await checkBusinessCalendarCoverage(new Date('2026-09-27T03:00:00Z'))).toEqual({ missingYears: [] });
  });
});
