// Pure board filtering + view resolution. Composes the existing status-filter
// mapping with deadline-bucket and grade predicates. Server-importable (type-only
// component import is erased — see status-filter.ts precedent).
import type { RFP } from '@/lib/types/rfp';
import { filterRfpsByParam } from '@/lib/server/status-filter';

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
