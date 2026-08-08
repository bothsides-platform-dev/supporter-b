import { describe, expect, it } from 'vitest';

import { phoneFor, sendPreflightOk } from '../send-preflight';

// 이 두 술어가 스모크 하네스에서 **실제 돈과 남의 휴대폰** 앞에 서 있는 유일한 가드다.
// `--degrade` 가 PG 번호 요구를 면제하면서 조건 분기가 늘었으므로 진리표로 못박는다.
// 하네스 본체(라이브 API 왕복)는 테스트하지 않는다 — 측정하려고 존재하는 API 를
// 목으로 대체하면 측정 자체가 무의미해진다. 이 둘만 순수 함수로 뽑아 검증한다.

const REAL = {
  buyerEmail: 'buyer@example.com',
  pgEmail: 'pg@example.com',
  buyerPhone: '010-1111-2222',
  pgPhone: '010-3333-4444',
};
const PLACEHOLDER = '010-1234-5678';

describe('sendPreflightOk — --send 하드 거부 게이트', () => {
  it('--send 없으면 게이트가 적용되지 않는다 (초안 전용 — 메일이 안 나간다)', () => {
    expect(sendPreflightOk({ wantSend: false, wantDegrade: false })).toBe(true);
    expect(sendPreflightOk({ wantSend: false, wantDegrade: true })).toBe(true);
  });

  it('--send 는 이메일 둘 + 양쪽 번호가 모두 있어야 통과한다', () => {
    expect(sendPreflightOk({ wantSend: true, wantDegrade: false, ...REAL })).toBe(true);
    expect(
      sendPreflightOk({ wantSend: true, wantDegrade: false, ...REAL, pgPhone: undefined }),
    ).toBe(false);
    expect(
      sendPreflightOk({ wantSend: true, wantDegrade: false, ...REAL, buyerPhone: undefined }),
    ).toBe(false);
  });

  it('--degrade 는 PG 번호만 면제한다 — 그 외 어떤 값도 면제하지 않는다', () => {
    expect(
      sendPreflightOk({ wantSend: true, wantDegrade: true, ...REAL, pgPhone: undefined }),
    ).toBe(true);
    // 구매사 번호는 여전히 필수다. degrade 는 PG 쪽 한 칸만 비우는 측정이다.
    expect(
      sendPreflightOk({ wantSend: true, wantDegrade: true, ...REAL, buyerPhone: undefined }),
    ).toBe(false);
    // 이메일은 어느 쪽도 면제되지 않는다 — 수신자가 없으면 측정 자체가 성립하지 않는다.
    expect(sendPreflightOk({ wantSend: true, wantDegrade: true, ...REAL, pgEmail: undefined })).toBe(
      false,
    );
    expect(
      sendPreflightOk({ wantSend: true, wantDegrade: true, ...REAL, buyerEmail: undefined }),
    ).toBe(false);
  });

  it('빈 문자열은 없는 것과 같게 취급한다 — env 를 빈 값으로 export 한 경우', () => {
    expect(sendPreflightOk({ wantSend: true, wantDegrade: false, ...REAL, pgPhone: '' })).toBe(
      false,
    );
    expect(sendPreflightOk({ wantSend: true, wantDegrade: true, ...REAL, buyerPhone: '' })).toBe(
      false,
    );
  });

  // 이 게이트가 존재하는 이유 자체 — 자리표시자 번호로 **모르는 사람에게** 실제
  // 간편인증 요청이 나가고 과금까지 되는 사고. 존재 검사만으로는 이걸 막지 못한다:
  // 자리표시자는 비어 있지 않다. 헤더 주석과 초안 모드 로그가 그 번호를 그대로 찍어서
  // 복붙 경로가 실재한다.
  it('자리표시자 번호는 --send 를 통과하지 못한다 — 게이트의 존재 이유', () => {
    expect(
      sendPreflightOk({
        wantSend: true,
        wantDegrade: false,
        ...REAL,
        buyerPhone: PLACEHOLDER,
        placeholder: PLACEHOLDER,
      }),
    ).toBe(false);
    expect(
      sendPreflightOk({
        wantSend: true,
        wantDegrade: false,
        ...REAL,
        pgPhone: PLACEHOLDER,
        placeholder: PLACEHOLDER,
      }),
    ).toBe(false);
  });

  it('구분자만 다른 자리표시자도 막는다 — 숫자만 비교한다', () => {
    expect(
      sendPreflightOk({
        wantSend: true,
        wantDegrade: false,
        ...REAL,
        buyerPhone: '01012345678',
        placeholder: PLACEHOLDER,
      }),
    ).toBe(false);
  });

  it('초안 모드에서는 자리표시자가 정상이다 — 메일이 나가지 않는다', () => {
    expect(
      sendPreflightOk({ wantSend: false, wantDegrade: false, buyerPhone: PLACEHOLDER, placeholder: PLACEHOLDER }),
    ).toBe(true);
  });
});

describe('phoneFor — 어느 번호가 페이로드에 실리는가', () => {
  it('degrade 면 PG 번호는 env 에 있어도 undefined 다 — 이것이 게이트 면제의 근거다', () => {
    // 순서가 load-bearing: degrade 판정이 wantSend·env 보다 **먼저** 와야 한다.
    // 그래야 자리표시자도, 실번호도 PG 참여자에 닿지 않는다.
    expect(
      phoneFor('pg', { wantSend: true, wantDegrade: true, placeholder: PLACEHOLDER, ...REAL }),
    ).toBeUndefined();
    expect(
      phoneFor('pg', { wantSend: false, wantDegrade: true, placeholder: PLACEHOLDER, ...REAL }),
    ).toBeUndefined();
  });

  it('degrade 는 구매사 번호를 건드리지 않는다', () => {
    expect(
      phoneFor('buyer', { wantSend: true, wantDegrade: true, placeholder: PLACEHOLDER, ...REAL }),
    ).toBe(REAL.buyerPhone);
  });

  it('--send 면 실번호, 아니면 자리표시자를 쓴다', () => {
    expect(
      phoneFor('pg', { wantSend: true, wantDegrade: false, placeholder: PLACEHOLDER, ...REAL }),
    ).toBe(REAL.pgPhone);
    expect(
      phoneFor('pg', { wantSend: false, wantDegrade: false, placeholder: PLACEHOLDER, ...REAL }),
    ).toBe(PLACEHOLDER);
    expect(
      phoneFor('buyer', { wantSend: false, wantDegrade: false, placeholder: PLACEHOLDER, ...REAL }),
    ).toBe(PLACEHOLDER);
  });
});
