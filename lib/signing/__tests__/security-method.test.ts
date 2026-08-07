import { describe, it, expect } from 'vitest';

import { resolveSecurityMethod } from '../security-method';

describe('resolveSecurityMethod — 기본강제, 못 하면 차단(강등 아님)', () => {
  it('유효한 010 번호면 간편인증을 강제하고 하이픈 포맷으로 실는다', () => {
    // users.phone 은 normalizePhone 이 하이픈을 벗긴 숫자만으로 저장된다.
    // 공급자는 하이픈 포맷을 받고 그대로 에코한다(실측).
    expect(resolveSecurityMethod('01012345678')).toEqual({
      enforced: true,
      method: 'easy_cert',
      phone: '010-1234-5678',
      providerSecurity: { method: 'identity_verification' },
    });
  });

  it('이미 하이픈이 붙어 있어도 같은 결과다 (멱등)', () => {
    expect(resolveSecurityMethod('010-1234-5678')).toEqual({
      enforced: true,
      method: 'easy_cert',
      phone: '010-1234-5678',
      providerSecurity: { method: 'identity_verification' },
    });
  });

  it.each([null, undefined, '', '   '])('phone 이 없으면(%s) PHONE_MISSING 으로 차단한다', (phone) => {
    // 템플릿 역할 정책은 템플릿 단위라 계약별 강등이 불가능하다 — 역할이
    // easy_cert 면 phone 은 필수이고 없으면 공급자가 400 을 낸다(실측).
    // 그래서 강등이 아니라 우리 쪽에서 미리 차단하고 보완을 유도한다.
    expect(resolveSecurityMethod(phone)).toEqual({ enforced: false, reason: 'PHONE_MISSING' });
  });

  it.each(['0111234567', '016-123-4567', '01712345678', '0181234567', '0191234567'])(
    '구 번호대(%s)는 PHONE_NOT_MOBILE_010 으로 차단한다 — 공급자가 010 만 받는다',
    (phone) => {
      // 실측: "간편인증 휴대폰 번호는 010으로 시작하는 국내 휴대폰 번호여야 합니다".
      // 이유를 갈라야 화면이 "인증을 완료해주세요"와 "010 번호만 지원해요"를
      // 구분해 안내할 수 있다.
      expect(resolveSecurityMethod(phone)).toEqual({
        enforced: false,
        reason: 'PHONE_NOT_MOBILE_010',
      });
    },
  );

  it.each([
    ['02-123-4567', '유선번호'],
    ['0101234', '너무 짧다'],
    ['010123456789', '너무 길다'],
    ['abc-defg-hijk', '숫자가 아니다'],
    ['+821012345678', '국가코드 접두'],
  ])('휴대폰 형식이 아니면(%s — %s) 차단한다 (fail-closed)', (phone) => {
    expect(resolveSecurityMethod(phone).enforced).toBe(false);
  });

  it('차단 결과에는 phone·providerSecurity 를 절대 싣지 않는다', () => {
    const d = resolveSecurityMethod(null);
    expect(d).not.toHaveProperty('phone');
    expect(d).not.toHaveProperty('providerSecurity');
    expect(d).not.toHaveProperty('method');
  });
});

