import { describe, expect, it } from 'vitest';

import { errorLabel } from '../error-label';

// 서버가 준 에러 코드를 사용자 문구로 바꾸는 조회는 세 설정 폼이 공유한다
// (WorkspaceLogoForm·WorkspaceBizNoForm·WorkspaceNameForm). 목적이 "내부 enum 을
// 절대 노출하지 않는다" 이므로, 조회가 미매핑 키에서 반드시 fallback 으로 떨어져야
// 한다 — 평범한 객체 리터럴을 `map[code]` 로 직접 읽으면 그 보장이 깨진다.
const MAP: Record<string, string> = {
  FORBIDDEN_NOT_ADMIN: '권한이 없어요.',
  MIME_MISMATCH: '파일 내용이 형식과 달라요.',
};

const FALLBACK = '저장하지 못했어요.';

describe('errorLabel', () => {
  it('매핑된 코드는 그 문구를 돌려준다', () => {
    expect(errorLabel(MAP, 'FORBIDDEN_NOT_ADMIN', FALLBACK)).toBe('권한이 없어요.');
    expect(errorLabel(MAP, 'MIME_MISMATCH', FALLBACK)).toBe('파일 내용이 형식과 달라요.');
  });

  it('미매핑 코드는 fallback', () => {
    expect(errorLabel(MAP, 'SOMETHING_NEW', FALLBACK)).toBe(FALLBACK);
  });

  // 핵심 축: 프로토타입 체인 키는 `map[code]` 로 읽으면 **함수**가 잡히고 `??` 가
  // 발동하지 않는다. 그러면 toast 에 함수가 넘어가 사용자에게 내부 값이 새거나
  // 렌더가 깨진다. hasOwnProperty 판정만이 이 축을 막는다.
  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])(
    '프로토타입 체인 키(%s)는 미매핑으로 취급해 fallback',
    (key) => {
      expect(errorLabel(MAP, key, FALLBACK)).toBe(FALLBACK);
    },
  );

  // 응답 본문이 우리 형식이 아닐 수 있다(`res.json().catch(() => ({}))` 경로).
  // 문자열이 아닌 값이 키로 들어와도 문구를 만들어 내야 한다.
  it.each([undefined, null, 42, {}, [], true])(
    '문자열이 아닌 코드(%s)는 fallback',
    (code) => {
      expect(errorLabel(MAP, code, FALLBACK)).toBe(FALLBACK);
    },
  );

  it('반환값은 항상 string 이다', () => {
    for (const key of ['constructor', 'toString', 'UNKNOWN', 'FORBIDDEN_NOT_ADMIN']) {
      expect(typeof errorLabel(MAP, key, FALLBACK)).toBe('string');
    }
  });
});
