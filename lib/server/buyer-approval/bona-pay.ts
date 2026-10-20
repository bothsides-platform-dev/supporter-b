// Server-only creation path; never imported by client components.

export type GradeLookup = {
  provider: 'bona-pay';
  bizNo: string;
  checkedAt: string;
  effectiveDate: string | null;
  outcome: 'sole_confirmed' | 'non_sole' | 'no_information' | 'lookup_failed';
};

/** Public lookup integration; incomplete or failed responses never approve a buyer. */
export async function lookupBonaPayGrade(bizNo: string): Promise<GradeLookup> {
  const checkedAt = new Date().toISOString();
  const result: GradeLookup = {
    provider: 'bona-pay', bizNo, checkedAt, effectiveDate: null, outcome: 'lookup_failed',
  };
  if (!/^\d{10}$/.test(bizNo)) return result;

  const controller = new AbortController();
  // Cover headers AND the response body. No retry, redirect or cache.
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch('https://payweb.bona-pay.com/receipt/getGrade.info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ bizRegNo: bizNo }),
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.ok) return result;
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return result;
    const row = data as Record<string, unknown>;
    if (row.RESULT_CODE !== '0000' || row.BIZ_REG_NO !== bizNo) return result;
    if (row.IS_DEFAULT_LEVEL === 'Y') return { ...result, outcome: 'no_information' };
    if (row.IS_DEFAULT_LEVEL !== 'N') return result;
    const effectiveDate = parseEffectiveDate(row.FROMDT, checkedAt);
    if (!effectiveDate) return result;
    if (row.CORP_LEVEL === '영세') return { ...result, effectiveDate, outcome: 'sole_confirmed' };
    if (typeof row.CORP_LEVEL === 'string' && ['중소1', '중소2', '중소3', '일반'].includes(row.CORP_LEVEL)) {
      return { ...result, effectiveDate, outcome: 'non_sole' };
    }
    return result;
  } catch {
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function parseEffectiveDate(value: unknown, checkedAt: string): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(value);
  if (!match || !/^(?:\d{8}|\d{4}-\d{2}-\d{2})$/.test(value)) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const todayKst = new Date(Date.parse(checkedAt) + 9 * 60 * 60_000).toISOString().slice(0, 10);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    && date >= '2000-01-01' && date <= todayKst ? date : null;
}
