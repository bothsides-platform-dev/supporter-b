// Pure list filtering. Buyer active/closed filters use the effective bid
// deadline; `review` needs submitted-bid counts; other status tokens and PG
// inbox stages use status-filter.
// Pure (no DB/IO). Importing TYPES from 'use client' files (InboxRow) is erased at compile time, so this stays server-safe — see status-filter.ts.
import type { RFP } from '@/lib/types/rfp';
import { filterRfpsByParam, filterInboxRowsByParam } from '@/lib/server/status-filter';
import type { InboxRow } from '@/components/inbox/InboxList';
import { kstDateOf } from '@/lib/utils/deadline';
import { isRfpBidWindowOpen } from '@/lib/rfp/bid-window';

export type BoardFilterParams = {
  status?: string;
  q?: string;
  deadline?: string;
  grade?: string;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Deadline bucket predicate. Unknown/absent bucket → true (no filter).
 *
 * KST-고정: 런타임 로컬 TZ 에 의존하지 않고 항상 Asia/Seoul 달력 기준으로 판정한다.
 * (서버 TZ 가 UTC든 KST든 동일한 결과를 낸다.)
 */
export function matchesDeadlineBucket(
  deadline: string,
  bucket: string | undefined,
  now: Date,
): boolean {
  if (bucket !== 'd7' && bucket !== 'month' && bucket !== 'overdue') return true;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return false;

  // KST 달력 날짜 문자열('YYYY-MM-DD')로 변환해 날짜 경계를 비교한다.
  const kstNow = kstDateOf(now);
  // KST 오늘 자정 인스턴트: 'YYYY-MM-DDT00:00:00+09:00'
  const kstStartOfToday = new Date(`${kstNow}T00:00:00+09:00`).getTime();
  const t = d.getTime();

  if (bucket === 'overdue') return t < kstStartOfToday;
  if (bucket === 'd7') return t >= kstStartOfToday && t < kstStartOfToday + 8 * DAY;
  // month: KST 연·월이 일치하는지 'YYYY-MM' 앞 7자로 비교
  return kstDateOf(d).slice(0, 7) === kstNow.slice(0, 7);
}

/** Raw grade-enum equality. Absent param → true (no filter). */
export function matchesGrade(grade: string | undefined, gradeParam: string | undefined): boolean {
  if (!gradeParam) return true;
  return grade === gradeParam;
}

/**
 * `status=review` 는 홈 KPI `견적 검토대기`와 같은 집합이다 — 견적이 한 건 이상 도착한
 * `sent` 요청. 도착한 견적은 마감 뒤에도 선정할 수 있으므로 마감 여부로 거르지 않는다
 * (SCREEN_DESIGN B1). 견적 수는 RFP 행에 없으므로 호출처가 `submittedCountByRfp` 로 넘긴다.
 * 넘기지 않으면 아무것도 보여주지 않는다 — 도착 여부를 모르는 채 전체를 보여주면 필터가 거짓말을 한다.
 */
export function filterRfps(
  rfps: RFP[],
  params: BoardFilterParams,
  now: Date,
  submittedCountByRfp?: ReadonlyMap<string, number>,
): RFP[] {
  const byStatus = params.status === 'active'
    ? rfps.filter((r) => isRfpBidWindowOpen(r, now.getTime()))
    : params.status === 'closed'
      ? rfps.filter((r) => r.status === 'sent' ? !isRfpBidWindowOpen(r, now.getTime()) : ['closed', 'cancelled', 'awarded'].includes(r.status))
      : params.status === 'review'
        ? rfps.filter((r) => r.status === 'sent' && (submittedCountByRfp?.get(r.id) ?? 0) > 0)
        : filterRfpsByParam(rfps, params.status);
  return byStatus
    .filter((r) => matchesDeadlineBucket(r.deadline, params.deadline, now))
    .filter((r) => matchesGrade(r.bizProfile?.grade, params.grade));
}

export function filterInboxRows(rows: InboxRow[], params: BoardFilterParams, now: Date): InboxRow[] {
  return filterInboxRowsByParam(rows, params.status, now.getTime())
    .filter(r => !params.q?.trim() || `${r.buyerName ?? ""} ${r.rfpTitle} ${r.rfpId}`.toLocaleLowerCase().includes(params.q.trim().toLocaleLowerCase()))
    .filter((r) => matchesDeadlineBucket(r.rfpDeadline, params.deadline, now))
    .filter((r) => matchesGrade(r.gradeRaw, params.grade));
}
