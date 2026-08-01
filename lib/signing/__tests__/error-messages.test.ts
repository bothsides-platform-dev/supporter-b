import { describe, expect, it } from 'vitest';

import { SIGNING_ERROR_MESSAGES, signingErrorMessage } from '../error-messages';

// 코드 목록을 손으로 복사하지 않는다 — 맵의 키를 그대로 훑는다. (예전엔 복사본이라
// 신규 코드가 검증 없이 추가돼도 초록이었다.)
const KNOWN_CODES = Object.keys(SIGNING_ERROR_MESSAGES);

// 화면이 실제로 띄우는 경로들 — 맵에서 사라지면 사용자에게 raw 코드가 샌다.
const REQUIRED_CODES = [
  'CONTRACT_BUSY',
  'CONTRACT_NOT_SENT',
  'SNOWSIGN_EMBED_SESSION_ACTIVE',
  'FORBIDDEN',
  'ALREADY_SENT',
];

describe('signingErrorMessage', () => {
  it('maps every known code to a friendly Korean message with no raw-code token', () => {
    for (const code of KNOWN_CODES) {
      const msg = signingErrorMessage(code);
      expect(msg).not.toBe(code);
      expect(msg).toMatch(/[가-힣]/); // 한글 포함
      expect(msg).not.toMatch(/[A-Z]{3,}_[A-Z]/); // raw 코드 흔적 없음
    }
  });

  it('keeps the codes the signing UI actually raises', () => {
    for (const code of REQUIRED_CODES) expect(KNOWN_CODES).toContain(code);
  });

  it('returns the provided fallback for an unknown code (never the raw code)', () => {
    expect(signingErrorMessage('SOME_WEIRD_CODE', '리마인더를 보내지 못했어요')).toBe(
      '리마인더를 보내지 못했어요',
    );
    expect(signingErrorMessage('SOME_WEIRD_CODE')).toMatch(/[가-힣]/);
    expect(signingErrorMessage('SOME_WEIRD_CODE')).not.toMatch(/SOME_WEIRD_CODE/);
  });

  it('returns the fallback (or a generic Korean message) when code is undefined', () => {
    expect(signingErrorMessage(undefined, '저장하지 못했어요')).toBe('저장하지 못했어요');
    expect(signingErrorMessage(undefined)).toMatch(/[가-힣]/);
  });
});
