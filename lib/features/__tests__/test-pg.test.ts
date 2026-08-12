import { describe, it, expect } from 'vitest';
import {
  SHOW_TEST_PG_COOKIE,
  TEST_PG_NAME_TOKENS,
  isTestPgName,
  showTestPgFromCookie,
} from '../test-pg';

describe('isTestPgName', () => {
  it("이름에 '테스트' 가 들어가면 테스트 PG 다", () => {
    expect(isTestPgName('테스트 PG사')).toBe(true);
  });

  it("이름에 'test' 가 들어가면 대소문자 무관하게 테스트 PG 다", () => {
    expect(isTestPgName('Test Pay')).toBe(true);
    expect(isTestPgName('TEST PAY')).toBe(true);
    expect(isTestPgName('내부검증 test 계정')).toBe(true);
  });

  it('실제 PG 상호는 테스트 PG 가 아니다', () => {
    for (const name of ['토스페이먼츠', 'KG이니시스', '나이스페이먼츠', 'NHN KCP', 'KICC']) {
      expect(isTestPgName(name)).toBe(false);
    }
  });

  // 부분 문자열 매칭은 결정이지 버그가 아니다 — 상호 안에 토큰이 우연히 들어간
  // 정상 PG 도 숨겨진다(오탐). 되살리는 수단은 SHOW_TEST_PG_COOKIE 이스케이프 해치.
  // 이 케이스를 지우려면 규칙 자체를 바꾸는 결정이 먼저 있어야 한다.
  it('부분 문자열 오탐은 수용된 동작이다', () => {
    expect(isTestPgName('CONTEST 페이')).toBe(true);
  });

  it('빈 이름은 테스트 PG 가 아니다', () => {
    expect(isTestPgName('')).toBe(false);
  });

  // 토큰 배열이 규칙의 단일 출처다 — 토큰을 늘리면 이 케이스가 자동으로 따라온다.
  for (const token of TEST_PG_NAME_TOKENS) {
    it(`토큰 '${token}' 이 든 이름은 테스트 PG 다`, () => {
      expect(isTestPgName(`앞 ${token} 뒤`)).toBe(true);
    });
  }
});

describe('showTestPgFromCookie', () => {
  it("'1' 일 때만 해제된다", () => {
    expect(showTestPgFromCookie('1')).toBe(true);
  });

  it('그 밖의 값은 전부 해제가 아니다', () => {
    for (const raw of [undefined, '', '0', 'true', 'yes', '2', ' 1']) {
      expect(showTestPgFromCookie(raw)).toBe(false);
    }
  });
});

describe('SHOW_TEST_PG_COOKIE', () => {
  // 콘솔 한 줄(document.cookie='support-b-show-test-pg=1; path=/')과의 계약.
  // 바꾸면 안내 문구와 운영자 손가락 기억이 함께 깨진다.
  it('쿠키 이름이 고정돼 있다', () => {
    expect(SHOW_TEST_PG_COOKIE).toBe('support-b-show-test-pg');
  });
});
