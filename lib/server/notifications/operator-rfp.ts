import { escapeSlackText, sendSlackMessage } from '@/lib/integrations/slack';

export type RfpOperatorEvent =
  | 'request_sent'
  | 'consultation_requested'
  | 'consultation_reviewing'
  | 'consultation_rejected'
  | 'consultation_next'
  | 'bid_submitted'
  | 'awarded';

export interface RfpOperatorNotice {
  event: RfpOperatorEvent;
  rfpCode: string;
  rfpTitle: string;
  pgNames: string[];
  round?: number;
}

const EVENT_LABEL: Record<RfpOperatorEvent, string> = {
  request_sent: '견적 요청 발송',
  consultation_requested: '맞춤 상담 요청',
  consultation_reviewing: '상담 검토 시작',
  consultation_rejected: '상담 거절',
  consultation_next: '다음 PG사 상담 요청',
  bid_submitted: '견적 제출',
  awarded: '최종 선정',
};

// 전송층은 4,000 UTF-16 코드 단위에서 자른다. 제목·고정 문구를 위한 여유를 둔다.
const PG_NAMES_TEXT_MAX = 2800;

export function buildRfpOperatorMessage(notice: RfpOperatorNotice): string {
  const shown: string[] = [];
  let shownLength = 0;
  for (const name of notice.pgNames) {
    const escaped = escapeSlackText(name);
    const nextLength = shownLength + (shown.length ? 2 : 0) + escaped.length;
    if (nextLength > PG_NAMES_TEXT_MAX) break;
    shown.push(escaped);
    shownLength = nextLength;
  }
  const omitted = notice.pgNames.length - shown.length;
  const names = `${shown.join(', ')}${omitted ? `${shown.length ? ', ' : ''}외 ${omitted}곳` : ''}`;
  const round = notice.round && notice.round > 1 ? ` (${notice.round}회차)` : '';
  return `📣 [견적] ${EVENT_LABEL[notice.event]} — [${notice.rfpCode}] ${escapeSlackText(notice.rfpTitle)} · PG사: ${names}${round}`;
}

export async function notifyRfpOperator(notice: RfpOperatorNotice): Promise<void> {
  try {
    await sendSlackMessage({ text: buildRfpOperatorMessage(notice) });
  } catch {
    // 운영 채널 장애는 이미 커밋된 업무 결과에 영향을 주지 않는다.
  }
}
