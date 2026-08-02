import { describe, expect, it } from 'vitest';

import { SEND_TAKEN_OVER_TYPE, isSendTakenOverFor } from '../takeover-signal';

const n = (over: Partial<{ type: string; linkUrl?: string }> = {}) => ({
  type: SEND_TAKEN_OVER_TYPE,
  linkUrl: '/inbox/P-2608-0001',
  ...over,
});

describe('isSendTakenOverFor', () => {
  it('이 딜의 이어받기 알림이면 참', () => {
    expect(isSendTakenOverFor(n(), 'P-2608-0001')).toBe(true);
  });

  // 다른 딜의 알림으로 작성 중인 화면이 닫히면 작업이 날아간다.
  it('다른 딜의 이어받기 알림이면 거짓', () => {
    expect(isSendTakenOverFor(n(), 'P-2608-0002')).toBe(false);
  });

  // 접두어 매칭이면 P-2608-0001 알림이 P-2608-000 화면을 닫는다. 경로 세그먼트로 고정.
  it('코드가 접두어로만 겹치면 거짓', () => {
    expect(isSendTakenOverFor(n({ linkUrl: '/inbox/P-2608-00012' }), 'P-2608-0001')).toBe(false);
  });

  it('다른 타입의 알림은 코드가 같아도 거짓', () => {
    expect(isSendTakenOverFor(n({ type: 'signing.completed' }), 'P-2608-0001')).toBe(false);
  });

  it('linkUrl 이 없으면 거짓 — 어느 딜인지 알 수 없다', () => {
    expect(isSendTakenOverFor({ type: SEND_TAKEN_OVER_TYPE }, 'P-2608-0001')).toBe(false);
  });

  // 쿼리·해시가 붙어도 마지막 경로 세그먼트는 그대로여야 한다.
  it('쿼리스트링이 붙어도 매칭한다', () => {
    expect(isSendTakenOverFor(n({ linkUrl: '/inbox/P-2608-0001?tab=signing' }), 'P-2608-0001')).toBe(
      true,
    );
  });
});
