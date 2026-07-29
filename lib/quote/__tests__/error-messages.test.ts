import { describe, expect, it } from 'vitest';

import { quoteTemplateErrorMessage } from '../error-messages';
import { MAX_QUOTE_TEMPLATES } from '../limits';

// 견적 템플릿 액션이 사용자에게 흘릴 수 있는 코드 전부. raw 코드가 새면 안 된다
// (UX_WRITING §에러 원칙). lib/signing/__tests__/error-messages.test.ts 와 같은 계약.
const KNOWN_CODES = [
  'INVALID_INPUT',
  'LIMIT_REACHED',
  'TEMPLATE_NOT_FOUND',
  'FORBIDDEN',
  'FORBIDDEN_PG',
];

// 매핑에 **없는** 코드여야 폴백 분기가 실제로 실행된다. 매핑에 있는 코드를 쓰면
// 통과는 하지만 아무것도 증명하지 못한다(가짜 테스트).
const UNMAPPED = 'SOME_CODE_WE_DO_NOT_MAP';

describe('quoteTemplateErrorMessage', () => {
  it('maps every known code to Korean with no raw-code token', () => {
    for (const code of KNOWN_CODES) {
      const msg = quoteTemplateErrorMessage(code);
      expect(msg).not.toBe(code);
      expect(msg).toMatch(/[가-힣]/);
      expect(msg).not.toMatch(/[A-Z]{3,}_[A-Z]/);
    }
  });

  it('사전에 없는 코드는 호출 문맥 fallback 을 쓴다', () => {
    expect(quoteTemplateErrorMessage(UNMAPPED, '템플릿을 복제하지 못했어요')).toBe(
      '템플릿을 복제하지 못했어요',
    );
  });

  it('사전에 없는 코드에 fallback 도 없으면 일반 안내를 쓰고 코드를 노출하지 않는다', () => {
    const msg = quoteTemplateErrorMessage(UNMAPPED);
    expect(msg).not.toContain(UNMAPPED);
    expect(msg).toMatch(/[가-힣]/);
  });

  it('코드가 undefined 여도 fallback / 일반 안내로 떨어진다', () => {
    expect(quoteTemplateErrorMessage(undefined, '저장하지 못했어요')).toBe('저장하지 못했어요');
    expect(quoteTemplateErrorMessage(undefined)).toMatch(/[가-힣]/);
  });

  // 상한은 서버가 강제하는 값 하나에서 파생돼야 한다 — 문구에 20 을 손으로 박으면
  // 서버 상한을 올렸을 때 사용자에게 거짓말이 남는다.
  it('상한 문구가 MAX_QUOTE_TEMPLATES 에서 파생된다', () => {
    expect(quoteTemplateErrorMessage('LIMIT_REACHED')).toContain(String(MAX_QUOTE_TEMPLATES));
  });
});
