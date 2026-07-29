import { describe, expect, it } from 'vitest';

import { signingErrorMessage } from '../error-messages';

// 서명 UI(SigningTab/SigningTemplateManager)·다운로드 프록시가 사용자에게 보이는 에러
// 코드 전부. raw 코드가 사용자에게 새면 안 된다(UX_WRITING §에러 원칙).
const KNOWN_CODES = [
  'SNOWSIGN_NETWORK',
  'SNOWSIGN_RATE_LIMIT',
  'SNOWSIGN_MALFORMED',
  'SNOWSIGN_NO_KEY',
  'SNOWSIGN_INVALID_KEY',
  'SNOWSIGN_VALIDATION',
  'SNOWSIGN_NOT_FOUND',
  'SNOWSIGN_QUOTA_EXCEEDED',
  'SNOWSIGN_INVALID_STATUS',
  'SNOWSIGN_UPLOAD_EXPIRED',
  'SNOWSIGN_PDF_REJECTED',
  'SNOWSIGN_ERROR',
  'CONTRACT_BUSY',
  'NOT_SENT',
  'ALREADY_SENT',
  'CONTRACT_CHANGED',
  'TEMPLATE_NOT_FOUND',
  'PERSIST_FAILED',
  'SIGNER_NOT_FOUND',
  'TEMPLATE_ALREADY_LINKED',
  'ROLE_MAPPING_INCOMPLETE',
  'CONTRACT_NOT_FOUND',
  'FORBIDDEN',
  'NOT_AWARDED',
  'BID_NOT_FOUND',
  'RFP_NOT_FOUND',
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
