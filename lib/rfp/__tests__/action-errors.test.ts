import { describe, expect, it } from 'vitest';
import { rfpActionErrorMessage } from '../action-errors';

const FALLBACK = '추가하지 못했어요. 잠시 후 다시 시도해요.';

describe('rfpActionErrorMessage', () => {
  it('사용자가 다르게 행동해야 하는 코드는 그 이유를 말한다', () => {
    expect(rfpActionErrorMessage('RFP_DEADLINE_PASSED', FALLBACK)).toBe(
      '견적 접수 기간이 끝났어요. 새로고침해 최신 상태를 확인해요.',
    );
    expect(rfpActionErrorMessage('REQUOTE_PENDING', FALLBACK)).toBe(
      '수정 요청에 응답하는 동안은 견적을 철회할 수 없어요.',
    );
  });

  it('상태 전이 실패는 내부 사유를 버리고 상태가 바뀌었다고만 말한다', () => {
    const message = rfpActionErrorMessage('INVALID_TRANSITION: awarded -> closed', FALLBACK);
    expect(message).toBe('견적 요청 상태가 바뀌었어요. 새로고침해 최신 상태를 확인해요.');
    expect(message).not.toMatch(/INVALID_TRANSITION|awarded|closed/);
  });

  // 서버 코드가 화면에 그대로 나가면 안 된다 — 표에 없는 코드, 프로토타입 키, 문자열이 아닌 값.
  it.each(['FORBIDDEN_BUYER', 'SOMETHING_NEW', 'constructor', 'toString', undefined, null, 42])(
    '모르는 코드 %s 는 호출처의 기본 문구로 떨어진다',
    (code) => {
      expect(rfpActionErrorMessage(code, FALLBACK)).toBe(FALLBACK);
    },
  );
});
