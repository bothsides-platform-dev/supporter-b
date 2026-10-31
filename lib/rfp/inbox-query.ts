import type { PaymentMethod } from '@/lib/types/bid';
import type { InboxRow } from '@/components/inbox/InboxList';
import { filterInboxRows, type BoardFilterParams } from '@/lib/server/board/filterRfps';
import { pgRequestState } from './pg-request-state';

export const INBOX_VIEWS = [
  { value: '', label: '전체' },
  { value: 'response', label: '응답 필요' },
  { value: 'revision', label: '수정 요청' },
  { value: 'draft', label: '내 초안' },
  { value: 'submitted', label: '보낸 견적' },
  { value: 'closed', label: '종료' },
] as const;
export const INBOX_PAGE_SIZE = 50;
export type InboxParams = BoardFilterParams & {
  industry?: string;
  method?: string;
  sort?: string;
  page?: string;
  selected?: string;
  from?: string;
  to?: string;
};

export function parseInboxParams(
  input: Record<string, string | string[] | undefined>,
): InboxParams {
  const keys = [
    'status',
    'q',
    'deadline',
    'grade',
    'industry',
    'method',
    'sort',
    'page',
    'selected',
    'from',
    'to',
  ];
  return Object.fromEntries(
    keys.flatMap((key) => {
      const raw = input[key];
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (!value || value.length > 200) return [];
      if (
        (key === 'from' || key === 'to') &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)))
      )
        return [];
      return [[key, value]];
    }),
  );
}
export function queryInbox(all: InboxRow[], rawParams: InboxParams, now = new Date()) {
  const params = parseInboxParams(rawParams);
  const filtered = filterInboxRows(all, { ...params, status: undefined }, now)
    .filter((r) => !params.industry || r.industryName === params.industry)
    .filter(
      (r) =>
        !params.method ||
        r.requiredPaymentMethods?.includes(params.method as PaymentMethod) ||
        r.customPaymentMethods?.some((m) => m.id === params.method),
    )
    .filter(
      (r) =>
        !params.from || Date.parse(r.rfpDeadline) >= Date.parse(`${params.from}T00:00:00+09:00`),
    )
    .filter(
      (r) =>
        !params.to || Date.parse(r.rfpDeadline) <= Date.parse(`${params.to}T23:59:59.999+09:00`),
    );
  const counts = Object.fromEntries(
    INBOX_VIEWS.map((v) => [v.value, filterInboxRows(filtered, { status: v.value }, now).length]),
  );
  const rows = filterInboxRows(filtered, { status: params.status }, now).toSorted((a, b) => {
    if (params.sort === 'recent')
      return (
        Date.parse(b.receivedAt ?? '') - Date.parse(a.receivedAt ?? '') ||
        a.rfpId.localeCompare(b.rfpId)
      );
    const priority =
      params.sort === 'deadline'
        ? 0
        : Number(pgRequestState(b, now.getTime()).needsResponse) -
          Number(pgRequestState(a, now.getTime()).needsResponse);
    return (
      priority ||
      Date.parse(a.rfpDeadline) - Date.parse(b.rfpDeadline) ||
      a.rfpId.localeCompare(b.rfpId)
    );
  });
  const pages = Math.max(1, Math.ceil(rows.length / INBOX_PAGE_SIZE));
  const parsed = Number(params.page);
  const page = Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, pages) : 1;
  return {
    rows: rows.slice((page - 1) * INBOX_PAGE_SIZE, page * INBOX_PAGE_SIZE),
    order: rows.map((r) => r.rfpId),
    counts,
    page,
    pages,
    filteredCount: rows.length,
  };
}
