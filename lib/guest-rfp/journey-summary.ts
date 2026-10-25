import type { StoredJourneyEvent } from './journey-contract';
import { formatJourneyEvents } from './journey-contract';

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n]+/g, ' / ');
const short = (value: string) => Array.from(value).slice(0, 100).join('') + (Array.from(value).length > 100 ? '…' : '');
const time = (value: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));

/** Summaries are bounded; the complete immutable observations remain in the DB. */
export function formatJourneySummary(events: StoredJourneyEvent[], detailUrl: string): string {
  const ordered = [...events].sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id));
  const last = ordered.at(-1)!;
  const completed = ordered.some(e => e.name === 'quote_request_submitted');
  const answers = new Map<string, StoredJourneyEvent>();
  const milestones = new Set<string>();
  const errors = new Map<string, number>();
  // Reuse the canonical Korean labels/action formatting without duplicating the vocabulary.
  const description = (event: StoredJourneyEvent) => formatJourneyEvents([{ ...event, answer: undefined }]).split('\n')[1].slice(9);
  for (const event of ordered) {
    if (event.name === 'funnel_step_complete' && event.answer !== undefined) {
      const key = `${event.funnel_id}:${event.step_id}`;
      answers.delete(key);
      answers.set(key, event);
    }
    if (event.name === 'sign_up') milestones.add('가입 완료 (서버 확인)');
    if (event.name === 'funnel_step_complete' && ['draft_complete', 'business', 'questions'].includes(event.step_id)) milestones.add(description(event));
    if (event.name === 'funnel_step_error') {
      const label = description(event).replace(/ 입력 오류.*$/, '');
      const key = `${label} · ${event.error_code ?? 'UNKNOWN'}`;
      errors.set(key, (errors.get(key) ?? 0) + 1);
    }
  }
  return [
    completed ? '견적 요청 완료 (서버 확인)' : '진행 요약',
    `${time(ordered[0].observedAt)}–${time(last.observedAt)} KST · 행동 ${ordered.length}개`,
    ...milestones,
    ...(!completed ? [`마지막 관측: ${description(last)}`] : []),
    ...Array.from(answers.values()).slice(-4).map(e => `${description(e)}: ${escape(short(e.answer || '미입력'))}`),
    ...(answers.size > 4 ? [`그 외 답변 ${answers.size - 4}개는 상세에서 확인해요.`] : []),
    ...(errors.size ? [`입력 오류 ${Array.from(errors.values()).reduce((a, b) => a + b, 0)}회`, ...Array.from(errors).slice(0, 5).map(([label, n]) => `${label}: ${n}회`)] : []),
    `<${detailUrl}|여정 상세 보기>`,
  ].join('\n');
}
