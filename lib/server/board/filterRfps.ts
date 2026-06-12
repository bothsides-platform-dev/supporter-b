// Pure board filtering + view resolution. Composes the existing status-filter
// mapping with deadline-bucket and grade predicates.
// Pure (no DB/IO). Importing TYPES from 'use client' files (InboxRow) is erased at compile time, so this stays server-safe — see status-filter.ts.
import type { RFP } from '@/lib/types/rfp';
import { filterRfpsByParam, filterInboxRowsByParam } from '@/lib/server/status-filter';
import type { InboxRow } from '@/components/inbox/InboxList';

export type BoardView = 'table' | 'board';

export type BoardFilterParams = {
  status?: string;
  deadline?: string;
  grade?: string;
};

const DAY = 24 * 60 * 60 * 1000;

/** Deadline bucket predicate. Unknown/absent bucket → true (no filter). */
export function matchesDeadlineBucket(
  deadline: string,
  bucket: string | undefined,
  now: Date,
): boolean {
  if (bucket !== 'd7' && bucket !== 'month' && bucket !== 'overdue') return true;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return false;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (bucket === 'overdue') return t < startOfToday;
  if (bucket === 'd7') return t >= startOfToday && t < startOfToday + 8 * DAY;
  // month
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/** Raw grade-enum equality. Absent param → true (no filter). */
export function matchesGrade(grade: string | undefined, gradeParam: string | undefined): boolean {
  if (!gradeParam) return true;
  return grade === gradeParam;
}

/**
 * 보드 뷰는 status 칩을 숨기므로(컬럼이 곧 status) status 파라미터를 무력화한다.
 * 토글 클릭 경로만이 아니라 직접 URL/쿠키 진입에서도 보이지 않는 필터가 남지 않도록
 * 서버 단일 지점에서 강제한다.
 */
export function paramsForView(params: BoardFilterParams, view: BoardView): BoardFilterParams {
  return view === 'board' ? { ...params, status: undefined } : params;
}

/** URL param > cookie > 'table'. */
export function resolveBoardView(
  paramView: string | undefined,
  cookieView: string | undefined,
): BoardView {
  if (paramView === 'table' || paramView === 'board') return paramView;
  if (cookieView === 'table' || cookieView === 'board') return cookieView;
  return 'table';
}

export function filterRfps(rfps: RFP[], params: BoardFilterParams, now: Date): RFP[] {
  return filterRfpsByParam(rfps, params.status)
    .filter((r) => matchesDeadlineBucket(r.deadline, params.deadline, now))
    .filter((r) => matchesGrade(r.bizProfile?.grade, params.grade));
}

export function filterInboxRows(rows: InboxRow[], params: BoardFilterParams, now: Date): InboxRow[] {
  return filterInboxRowsByParam(rows, params.status)
    .filter((r) => matchesDeadlineBucket(r.rfpDeadline, params.deadline, now))
    .filter((r) => matchesGrade(r.gradeRaw, params.grade));
}
