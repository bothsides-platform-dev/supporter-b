import { describe, it, expect } from 'vitest';
import {
  parseMentions,
  extractMentions,
  mentionsToPlainText,
  serializeMention,
  ALL_TOKEN,
} from '@/lib/utils/team-mentions';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

describe('serializeMention / ALL_TOKEN', () => {
  it('직렬화 형식', () => {
    expect(serializeMention(U1)).toBe(`<@${U1}>`);
    expect(ALL_TOKEN).toBe('<@all>');
  });
});

describe('parseMentions', () => {
  it('텍스트만이면 단일 text 세그먼트', () => {
    expect(parseMentions('안녕하세요')).toEqual([{ type: 'text', text: '안녕하세요' }]);
  });

  it('빈 문자열은 빈 배열', () => {
    expect(parseMentions('')).toEqual([]);
  });

  it('멘션 토큰을 mention 세그먼트로 분해', () => {
    expect(parseMentions(`<@${U1}> 확인해주세요`)).toEqual([
      { type: 'mention', userId: U1 },
      { type: 'text', text: ' 확인해주세요' },
    ]);
  });

  it('@all 토큰은 all 세그먼트', () => {
    expect(parseMentions(`다들 ${ALL_TOKEN} 보세요`)).toEqual([
      { type: 'text', text: '다들 ' },
      { type: 'all' },
      { type: 'text', text: ' 보세요' },
    ]);
  });

  it('여러 멘션 혼합', () => {
    expect(parseMentions(`<@${U1}> 와 <@${U2}>`)).toEqual([
      { type: 'mention', userId: U1 },
      { type: 'text', text: ' 와 ' },
      { type: 'mention', userId: U2 },
    ]);
  });

  it('토큰처럼 보이지만 형식이 다른 텍스트는 매칭하지 않는다', () => {
    expect(parseMentions('이메일 a@b 그리고 <@nope>')).toEqual([
      { type: 'text', text: '이메일 a@b 그리고 <@nope>' },
    ]);
  });
});

describe('extractMentions', () => {
  it('userId 집합과 all 플래그를 반환', () => {
    expect(extractMentions(`<@${U1}> <@${U2}> <@${U1}>`)).toEqual({
      userIds: [U1, U2],
      all: false,
    });
  });

  it('@all 이 있으면 all=true', () => {
    expect(extractMentions(`hi ${ALL_TOKEN}`)).toEqual({ userIds: [], all: true });
  });

  it('멘션 없으면 빈 결과', () => {
    expect(extractMentions('plain')).toEqual({ userIds: [], all: false });
  });
});

describe('mentionsToPlainText', () => {
  const names = new Map([[U1, '김민수'], [U2, '이영희']]);

  it('토큰을 @이름 으로 치환', () => {
    expect(mentionsToPlainText(`<@${U1}> 안녕`, names)).toBe('@김민수 안녕');
  });

  it('@all 은 @전체', () => {
    expect(mentionsToPlainText(`${ALL_TOKEN} 공지`, names)).toBe('@전체 공지');
  });

  it('알 수 없는 id 는 fallback', () => {
    expect(mentionsToPlainText(`<@${U2}>`, new Map())).toBe('@(알 수 없음)');
  });

  it('Record 형태도 허용', () => {
    expect(mentionsToPlainText(`<@${U1}>`, { [U1]: '김민수' })).toBe('@김민수');
  });
});
