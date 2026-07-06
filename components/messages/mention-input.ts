// 팀 채팅 멘션 컴포저 순수 로직 — textarea 평문 표시 ↔ 전송 시 구조화 토큰 변환.
// 무의존 순수 함수(렌더/상태 없음)로 TDD. TeamThreadView 가 이를 조립한다.
import { getChoseong } from 'es-hangul';
import { ALL_TOKEN, serializeMention } from '@/lib/utils/team-mentions';

export type MentionCandidate = { userId: string; name: string; joinedAt: string; avatarUpdatedAt: string | null };

export type MentionItem =
  | { kind: 'all' }
  | { kind: 'member'; userId: string; name: string; joinedAt: string; avatarUpdatedAt: string | null };

export type MentionPick =
  | { kind: 'all' }
  | { kind: 'member'; userId: string; name: string };

export type MentionQuery = { query: string; start: number };
export type TrackedMention = { display: string; token: string };

/** 커서 직전의 활성 `@쿼리` 를 찾는다. 멘션 컨텍스트가 아니면 null. */
export function detectMentionQuery(text: string, caret: number): MentionQuery | null {
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '@') {
      const before = i > 0 ? text[i - 1] : '';
      if (before === '' || /\s/.test(before)) {
        return { query: text.slice(i + 1, caret), start: i };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
    i--;
  }
  return null;
}

function matches(name: string, q: string): boolean {
  if (q === '') return true;
  return name.includes(q) || getChoseong(name).includes(q);
}

/** 후보 필터링 — 이름 substring/초성. '@전체' 는 매칭 시 상단 고정. */
export function buildMentionItems(candidates: MentionCandidate[], query: string): MentionItem[] {
  const q = query.trim();
  const items: MentionItem[] = [];
  const allMatches =
    q === '' || matches('전체', q) || 'all'.startsWith(q.toLowerCase());
  if (allMatches) items.push({ kind: 'all' });
  for (const c of candidates) {
    if (matches(c.name, q)) {
      items.push({ kind: 'member', userId: c.userId, name: c.name, joinedAt: c.joinedAt, avatarUpdatedAt: c.avatarUpdatedAt });
    }
  }
  return items;
}

/** `@쿼리` 구간을 표시 텍스트로 치환하고 추적 멘션을 반환. */
export function applyMentionSelection(
  text: string,
  query: MentionQuery,
  pick: MentionPick,
): { text: string; caret: number; tracked: TrackedMention } {
  const display = pick.kind === 'all' ? '@전체' : `@${pick.name}`;
  const token = pick.kind === 'all' ? ALL_TOKEN : serializeMention(pick.userId);
  const before = text.slice(0, query.start);
  const after = text.slice(query.start + 1 + query.query.length); // '@' + query 제거
  const insert = `${display} `;
  return { text: before + insert + after, caret: before.length + insert.length, tracked: { display, token } };
}

function indexOfDisplay(body: string, display: string): number {
  let from = 0;
  for (;;) {
    const idx = body.indexOf(display, from);
    if (idx < 0) return -1;
    const after = body[idx + display.length];
    // 경계: 끝이거나 글자/숫자가 아니어야 한다(@김 이 @김민수 안에서 매칭되지 않게).
    if (after === undefined || !/[\p{L}\p{N}]/u.test(after)) return idx;
    from = idx + 1;
  }
}

/** 전송 시 — 추적된 표시를 첫 미소비 occurrence 부터 토큰으로 치환. 사라진 건 드롭. */
export function resolveMentionsToBody(text: string, tracked: TrackedMention[]): string {
  let body = text;
  for (const t of tracked) {
    const idx = indexOfDisplay(body, t.display);
    if (idx < 0) continue;
    body = body.slice(0, idx) + t.token + body.slice(idx + t.display.length);
  }
  return body;
}
