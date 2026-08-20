import { formatInTimeZone } from 'date-fns-tz';
import { numberToHangulMixed } from 'es-hangul';

const KST = 'Asia/Seoul';

export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
}

/**
 * 원 단위 정수를 한국어로 읽기 쉽게 표기한다 — 억/만 그룹으로 끊고 콤마로 표기.
 * 예: 5000→`5,000원`, 50000000→`5,000만원`, 120000000→`1억2,000만원`.
 * 유효하지 않은 값(<=0·NaN·Infinity)은 힌트 생략을 위해 빈 문자열을 반환한다.
 */
export function formatKrwReadable(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${numberToHangulMixed(Math.floor(n))}원`;
}

export function formatPct(value: number, digits = 2): string {
  return (value * 100).toFixed(digits) + '%';
}

/**
 * 구매사 '현재 카드 수수료' 표기. 신규 데이터는 숫자만 저장("3.4") → "3.4%".
 * 이미 % 가 붙었거나 자유 텍스트인 과거 값("3.4%"·"협의 가능")은 그대로 둔다.
 */
export function formatFeeRateDisplay(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  return /^\d+(\.\d+)?$/.test(trimmed) ? `${trimmed}%` : value;
}

/**
 * 원 단위 숫자 문자열을 읽기 쉬운 한국어 금액으로. 신규 데이터는 숫자만("100000000")
 * → "1억원". 파싱 불가한 과거 자유 텍스트("월 1억")는 원문을 유지한다.
 * (annualPgVolume 표기 관용구를 단일 함수로 추출)
 */
export function formatKrwField(value: string | null | undefined): string {
  if (!value) return '';
  return formatKrwReadable(Number(value)) || value;
}

/**
 * 수수료율(%)을 1만원 결제 기준 원화 환산으로 표기한다.
 * 예: 1.25→`1만원 결제 시 125원`, 0.8→`1만원 결제 시 80원`.
 * 유효하지 않은 값(<=0·NaN·Infinity)은 힌트 생략을 위해 빈 문자열을 반환한다.
 */
export function formatRatePerManwon(ratePct: number): string {
  if (!Number.isFinite(ratePct) || ratePct <= 0) return '';
  return `1만원 결제 시 ${Math.round(ratePct * 100).toLocaleString()}원`;
}

export function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function formatDate(iso: string): string {
  // 마감일 저장 규약은 'YYYY-MM-DDT...' 형식이므로 앞 10자가 선택한 날짜다.
  // 레거시(T23:59:59Z)·신규(T23:59:59+09:00) 모두 slice(0,10) 로 올바른 날짜를 얻는다.
  // UTC 00:00:00 으로 붙여 formatInTimeZone UTC 포맷 → TZ 변환 없이 의도한 날짜 표시.
  return formatInTimeZone(
    new Date(iso.slice(0, 10) + 'T00:00:00Z'),
    'UTC',
    'yyyy. MM. dd.',
  );
}

export function formatDateTime(iso: string, timeZone: string = KST, fmt = 'yyyy-MM-dd HH:mm'): string {
  return formatInTimeZone(new Date(iso), timeZone, fmt);
}

/**
 * 마감일까지의 D-day를 KST 달력일 기준으로 반환한다.
 * - 마감 당일(KST) 종일 → 'D-0'
 * - 마감 이후(KST 기준) → '마감'
 * - N일 후 → 'D-N'
 *
 * 기존 ms 차이 ÷ 86400 방식은 KST 달력일과 어긋나는 케이스가 있었다
 * (예: 당일 KST 오후 → D-1, KST 자정 직후 → D-0).
 */
export function formatDeadline(iso: string): string {
  const deadlineDate = new Date(iso);
  const nowDate = new Date();
  // KST 달력 날짜 'YYYY-MM-DD' 로 변환
  const kstDeadline = formatInTimeZone(deadlineDate, KST, 'yyyy-MM-dd');
  const kstNow = formatInTimeZone(nowDate, KST, 'yyyy-MM-dd');
  // KST 자정 인스턴트로 정규화해 달력일 차이를 정수로 계산
  const kstDeadlineMs = new Date(`${kstDeadline}T00:00:00+09:00`).getTime();
  const kstNowMs = new Date(`${kstNow}T00:00:00+09:00`).getTime();
  const diff = Math.round((kstDeadlineMs - kstNowMs) / (1000 * 60 * 60 * 24));
  if (diff < 0) return '마감';
  if (diff === 0) return 'D-0';
  return `D-${diff}`;
}

/**
 * 어떤 시점 이후 **KST 달력일로** 며칠이 지났는지 — 당일이면 0.
 *
 * 위 `formatDeadline` 과 같은 이유로 ms ÷ 86400 을 쓰지 않는다(달력일과 어긋난다):
 * 자정 20분 뒤에 보면 20분 전 발송도 "어제"이고, 23시간 55분 전 발송이 같은 날이면
 * 여전히 "오늘"이다. `now` 를 주입받는 것은 테스트 결정성 때문이고(`buildDashboard`
 * 선례), 그 덕에 하이드레이션 시점의 서버·클라이언트 불일치도 호출자가 통제한다.
 */
export function elapsedCalendarDays(iso: string, now: Date): number {
  const kstThen = formatInTimeZone(new Date(iso), KST, 'yyyy-MM-dd');
  const kstNow = formatInTimeZone(now, KST, 'yyyy-MM-dd');
  const thenMs = new Date(`${kstThen}T00:00:00+09:00`).getTime();
  const nowMs = new Date(`${kstNow}T00:00:00+09:00`).getTime();
  return Math.max(0, Math.round((nowMs - thenMs) / (1000 * 60 * 60 * 24)));
}
