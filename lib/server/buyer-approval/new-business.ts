// Server-only: provider details are transient and never returned to the browser.
export type NewBusinessApproval = {
  provider: 'apick';
  bizNo: string;
  checkedAt: string;
  outcome: 'new_business_confirmed';
  openingDate: string;
  verifiedBy: 'nts_validate';
};

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;

/** Covers headers and body; no retry, redirect, cache or raw error logging. */
async function postJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { ...init, method: 'POST', signal: controller.signal, cache: 'no-store', redirect: 'error' });
    if (!response.ok) return undefined;
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function recentOpening(value: unknown, checkedAt: string): string | undefined {
  if (typeof value !== 'string' || !/^(?:\d{8}|\d{4}-\d{2}-\d{2})$/.test(value)) return;
  const digits = value.replaceAll('-', '');
  const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return;
  const today = new Date(Date.parse(checkedAt) + 9 * 60 * 60_000).toISOString().slice(0, 10);
  const month = parsed.getUTCMonth() + 6;
  const lastDay = new Date(Date.UTC(parsed.getUTCFullYear(), month + 1, 0)).getUTCDate();
  const anniversary = new Date(Date.UTC(parsed.getUTCFullYear(), month, Math.min(parsed.getUTCDate(), lastDay))).toISOString().slice(0, 10);
  return date <= today && today < anniversary ? date : undefined;
}

export async function lookupNewBusiness(bizNo: string): Promise<NewBusinessApproval | undefined> {
  const key = process.env.APICK_API_KEY;
  const ntsKey = process.env.NTS_SERVICE_KEY;
  if (!key || !ntsKey || !/^\d{10}$/.test(bizNo)) return;
  const checkedAt = new Date().toISOString();
  try {
    const body = new FormData();
    body.set('biz_no', bizNo);
    const result = record(await postJson('https://apick.app/rest/biz_detail', {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, body,
    }));
    const data = record(result?.data);
    if (record(result?.api)?.success !== true || data?.success !== 1
      || data.사업자등록번호 !== bizNo || data.상세정보확보 !== 'Y'
      || (data.정보제한여부 !== undefined && data.정보제한여부 !== 'N')) return;
    const openingDate = recentOpening(data.설립일, checkedAt);
    const name = data.대표명;
    if (!openingDate || typeof name !== 'string' || !name.trim() || name.length > 100) return;
    const requested = { b_no: bizNo, start_dt: openingDate.replaceAll('-', ''), p_nm: name.trim() };
    const verification = record(await postJson('https://api.odcloud.kr/api/nts-businessman/v1/validate', {
      headers: { Authorization: `Infuser ${ntsKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ businesses: [requested] }),
    }));
    if (verification?.status_code !== 'OK' || !Array.isArray(verification.data) || verification.data.length !== 1) return;
    const row = record(verification.data[0]);
    const status = record(row?.status);
    const echoed = record(row?.request_param);
    if (row?.valid !== '01' || row.b_no !== bizNo || status?.b_no !== bizNo || status.b_stt_cd !== '01'
      || echoed?.b_no !== bizNo || echoed.start_dt !== requested.start_dt || echoed.p_nm !== requested.p_nm) return;
    return { provider: 'apick', bizNo, checkedAt, outcome: 'new_business_confirmed', openingDate, verifiedBy: 'nts_validate' };
  } catch {
    // Optional automatic approval fails closed; signup remains available for manual review.
    return undefined;
  }
}
