import { describe, it, expect } from 'vitest';
import {
  detectMentionQuery,
  buildMentionItems,
  applyMentionSelection,
  resolveMentionsToBody,
  type MentionCandidate,
} from '../mention-input';
import { ALL_TOKEN, serializeMention } from '@/lib/team-mentions';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const cands: MentionCandidate[] = [
  { userId: U1, name: '김민수', joinedAt: '2026-03-14T00:00:00.000Z' },
  { userId: U2, name: '김민수', joinedAt: '2026-04-01T00:00:00.000Z' },
];

describe('detectMentionQuery', () => {
  it('커서 앞 @쿼리를 찾는다(문자열 시작)', () => {
    expect(detectMentionQuery('@김', 2)).toEqual({ query: '김', start: 0 });
  });
  it('공백 뒤 @ 도 인식', () => {
    expect(detectMentionQuery('안녕 @이', 5)).toEqual({ query: '이', start: 3 });
  });
  it('@ 앞이 문자면 멘션 아님(이메일 등)', () => {
    expect(detectMentionQuery('a@b', 3)).toBeNull();
  });
  it('@와 커서 사이 공백이 있으면 종료', () => {
    expect(detectMentionQuery('@김 민', 4)).toBeNull();
  });
  it('빈 쿼리(@ 직후)도 인식', () => {
    expect(detectMentionQuery('@', 1)).toEqual({ query: '', start: 0 });
  });
});

describe('buildMentionItems', () => {
  it('빈 쿼리는 @전체 + 전원', () => {
    const items = buildMentionItems(cands, '');
    expect(items[0]).toEqual({ kind: 'all' });
    expect(items).toHaveLength(3);
  });
  it('초성 검색(ㄱㅁㅅ → 김민수)', () => {
    const items = buildMentionItems(cands, 'ㄱㅁㅅ');
    expect(items.every((i) => i.kind === 'member')).toBe(true);
    expect(items).toHaveLength(2);
  });
  it('"전체" 쿼리는 @전체 매칭', () => {
    const items = buildMentionItems(cands, '전체');
    expect(items).toEqual([{ kind: 'all' }]);
  });
});

describe('applyMentionSelection', () => {
  it('개인 선택 시 @이름 삽입 + 토큰 추적', () => {
    const out = applyMentionSelection('@김', { query: '김', start: 0 }, {
      kind: 'member', userId: U1, name: '김민수',
    });
    expect(out.text).toBe('@김민수 ');
    expect(out.caret).toBe('@김민수 '.length);
    expect(out.tracked).toEqual({ display: '@김민수', token: serializeMention(U1) });
  });
  it('전체 선택 시 @전체 삽입 + all 토큰', () => {
    const out = applyMentionSelection('@', { query: '', start: 0 }, { kind: 'all' });
    expect(out.text).toBe('@전체 ');
    expect(out.tracked).toEqual({ display: '@전체', token: ALL_TOKEN });
  });
});

describe('resolveMentionsToBody', () => {
  it('추적된 표시를 토큰으로 치환', () => {
    const body = resolveMentionsToBody('@김민수 확인', [
      { display: '@김민수', token: serializeMention(U1) },
    ]);
    expect(body).toBe(`${serializeMention(U1)} 확인`);
  });
  it('동명이인 — 삽입 순서대로 각각 토큰화', () => {
    const body = resolveMentionsToBody('@김민수 @김민수 보세요', [
      { display: '@김민수', token: serializeMention(U1) },
      { display: '@김민수', token: serializeMention(U2) },
    ]);
    expect(body).toBe(`${serializeMention(U1)} ${serializeMention(U2)} 보세요`);
  });
  it('편집으로 사라진 멘션은 드롭(토큰 없음)', () => {
    const body = resolveMentionsToBody('그냥 텍스트', [
      { display: '@김민수', token: serializeMention(U1) },
    ]);
    expect(body).toBe('그냥 텍스트');
  });
  it('접두가 겹쳐도 부분 매칭하지 않는다(@김 vs @김민수)', () => {
    const body = resolveMentionsToBody('@김민수 안녕', [
      { display: '@김', token: serializeMention(U1) },
    ]);
    // '@김' 은 '@김민수' 안에서 매칭되지 않아야 한다 → 드롭.
    expect(body).toBe('@김민수 안녕');
  });
});
