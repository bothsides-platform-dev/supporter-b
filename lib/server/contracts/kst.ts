import { formatDateTime } from '@/lib/utils/format';

/**
 * 계약 문서 각인용 KST 절대시각 — `2026-07-17 11:30:00 (KST)`.
 *
 * 감사추적 확인서의 시각은 분쟁 증거이므로 **초까지, 타임존 명시**로 박는다
 * (화면용 `formatDateTime` 기본 포맷은 분 단위 + 타임존 미표기라 부적합).
 * 포맷 자체는 레포 공용 util 을 재사용해 date-fns-tz 사용처를 늘리지 않는다.
 */
export function fmtKst(d: Date): string {
  return `${formatDateTime(d.toISOString(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss')} (KST)`;
}
