import { describe, it, expect } from 'vitest';

import { resolveSecurityMethod, isSilentDowngrade } from '../security-method';

describe('resolveSecurityMethod — 기본강제 + phone 부재 시 이메일 강등', () => {
  it('유효한 11자리 휴대폰이면 간편인증을 강제하고 하이픈 포맷으로 실는다', () => {
    // users.phone 은 normalizePhone 이 하이픈을 벗긴 숫자만으로 저장된다.
    // 공급자 문서 예시는 하이픈 포맷(010-1234-5678)이라 전송 시 되붙인다.
    expect(resolveSecurityMethod('01012345678')).toEqual({
      method: 'easy_cert',
      downgraded: false,
      phone: '010-1234-5678',
      providerSecurity: { method: 'identity_verification' },
    });
  });

  it.each(['0111234567', '016-123-4567', '01712345678', '0181234567', '0191234567'])(
    '구 번호대(%s)는 강등한다 — 공급자가 010 만 받는다',
    (phone) => {
      // 실측(2026-08-07): easy_cert 역할에 구 번호를 보내면 VALIDATION_ERROR —
      // "간편인증 휴대폰 번호는 010으로 시작하는 국내 휴대폰 번호여야 합니다".
      // 그냥 보내면 우아한 강등이 아니라 발송 400 으로 딜이 죽는다.
      // (signup 의 isCompletePhone 은 01[0-9] 를 허용한다 — 그쪽은 건드리지 않는다.)
      expect(resolveSecurityMethod(phone)).toEqual({ method: 'email', downgraded: true });
    },
  );

  it('이미 하이픈이 붙어 있어도 같은 결과다 (멱등)', () => {
    expect(resolveSecurityMethod('010-1234-5678')).toEqual({
      method: 'easy_cert',
      downgraded: false,
      phone: '010-1234-5678',
      providerSecurity: { method: 'identity_verification' },
    });
  });

  it.each([null, undefined, '', '   '])('phone 이 없으면(%s) 이메일 인증으로 강등한다', (phone) => {
    // 발송 차단이 아니라 강등이 제품 결정이다. 단 downgraded 를 켜서
    // 화면·감사가 강등 사실을 볼 수 있게 한다 — 조용히 강등되면 강제가
    // 켜져 있는지 아무도 모른다.
    expect(resolveSecurityMethod(phone)).toEqual({ method: 'email', downgraded: true });
  });

  it.each([
    ['02-123-4567', '유선번호'],
    ['0101234', '너무 짧다'],
    ['010123456789', '너무 길다'],
    ['abc-defg-hijk', '숫자가 아니다'],
    ['+821012345678', '국가코드 접두'],
  ])('휴대폰 형식이 아니면(%s — %s) 강등한다 (fail-closed)', (phone) => {
    // 쓰레기 번호를 그대로 보내면 공급자가 발송을 거부해 딜이 멈춘다.
    // 강등이 그보다 낫다.
    expect(resolveSecurityMethod(phone)).toEqual({ method: 'email', downgraded: true });
  });

  it('강등 결과에는 phone·providerSecurity 를 절대 싣지 않는다', () => {
    const d = resolveSecurityMethod(null);
    expect(d).not.toHaveProperty('phone');
    // security 는 공급자 문서상 password 전용 필드다 — 간편인증이 아닌 참여자에게
    // 보내면 검증 오류가 된다("이메일/간편인증 역할에는 전달하지 않습니다").
    expect(d).not.toHaveProperty('providerSecurity');
  });
});

describe('isSilentDowngrade — 의도와 공급자 실제값 대조', () => {
  it('간편인증을 의도했는데 공급자가 이메일이면 조용한 강등이다', () => {
    expect(isSilentDowngrade('easy_cert', 'email')).toBe(true);
  });

  it('의도대로 간편인증이면 강등이 아니다', () => {
    expect(isSilentDowngrade('easy_cert', 'easy_cert')).toBe(false);
  });

  it('처음부터 이메일을 의도했으면 강등이 아니다 (정책 강등은 별 경로로 이미 기록된다)', () => {
    expect(isSilentDowngrade('email', 'email')).toBe(false);
  });

  it('공급자 값을 아직 모르면(reconcile 전) 강등으로 단정하지 않는다', () => {
    expect(isSilentDowngrade('easy_cert', undefined)).toBe(false);
  });
});
