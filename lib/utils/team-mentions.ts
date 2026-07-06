// 팀 채팅 멘션 토큰 — `body` 안에 구조화 저장되는 단일 진실 원천(SSOT).
// `<@{uuid}>` = 개인 멘션, `<@all>` = 전체 멘션. 클라+서버 공용 순수 모듈
// (next-auth/server-only import 금지 — TeamThreadView, TeamChatService 양쪽이 import).

export const ALL_TOKEN = '<@all>';

export function serializeMention(userId: string): string {
  return `<@${userId}>`;
}

// uuid(v4 형태) 또는 리터럴 'all'. 새 RegExp 를 호출마다 생성해 global lastIndex 상태 공유를 피한다.
const MENTION_SOURCE =
  '<@(all|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})>';

export type MentionSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; userId: string }
  | { type: 'all' };

export function parseMentions(body: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  const re = new RegExp(MENTION_SOURCE, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) segments.push({ type: 'text', text: body.slice(last, m.index) });
    segments.push(m[1] === 'all' ? { type: 'all' } : { type: 'mention', userId: m[1] });
    last = m.index + m[0].length;
  }
  if (last < body.length) segments.push({ type: 'text', text: body.slice(last) });
  return segments;
}

export function extractMentions(body: string): { userIds: string[]; all: boolean } {
  const ids: string[] = [];
  const seen = new Set<string>();
  let all = false;
  const re = new RegExp(MENTION_SOURCE, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m[1] === 'all') {
      all = true;
    } else if (!seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  }
  return { userIds: ids, all };
}

export function mentionsToPlainText(
  body: string,
  nameById: Map<string, string> | Record<string, string>,
): string {
  const lookup = (id: string): string | undefined =>
    nameById instanceof Map ? nameById.get(id) : nameById[id];
  return parseMentions(body)
    .map((seg) => {
      if (seg.type === 'text') return seg.text;
      if (seg.type === 'all') return '@전체';
      const name = lookup(seg.userId);
      return name ? `@${name}` : '@(알 수 없음)';
    })
    .join('');
}
