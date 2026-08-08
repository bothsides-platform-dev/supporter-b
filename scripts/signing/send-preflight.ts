// 스모크 하네스의 발송 안전 술어 — **순수 함수만** 둔다.
//
// 왜 별 모듈인가: `snowsign-smoke.ts` 는 top-level 에서 `entry()` 를 실행하므로 거기서
// export 하면 테스트가 임포트만으로 스모크 전체를 돌린다(라이브 API 왕복 포함).
//
// 왜 테스트하는가: `--degrade` 가 PG 번호 요구를 면제하면서 이 게이트가 조건 분기로
// 바뀌었다. 게이트가 막는 것은 사고 하나다 — 자리표시자 번호(`010-1234-5678`)로 **모르는
// 사람에게** 실제 간편인증 요청이 나가고 과금까지 되는 것. 하네스의 나머지(라이브 API
// 왕복)는 의도적으로 테스트하지 않는다: 측정하려고 존재하는 API 를 목으로 대체하면
// 측정이 무의미해진다. 순수 술어만 뽑아 진리표로 고정하는 것이 맞는 선이다.

export type SmokeContacts = {
  buyerEmail?: string;
  pgEmail?: string;
  buyerPhone?: string;
  pgPhone?: string;
};

export type SmokeMode = { wantSend: boolean; wantDegrade: boolean };

const digits = (v?: string) => (v ?? '').replace(/\D/g, '');

/**
 * `--send` 를 허용할지. 거부하면 하네스는 즉시 종료한다.
 *
 * `--degrade` 는 **PG 번호 한 칸만** 면제한다. 그것이 안전한 이유는 `phoneFor` 가
 * degrade 에서 PG 번호를 `undefined` 로 돌려주기 때문이다 — 번호가 아예 없으면 그
 * 참여자에게 인증 요청이 나가지 않는다(자리표시자로 남을 호출하는 원래 위험과 정반대).
 * 두 함수가 짝으로만 성립하므로 같은 모듈에 두고 함께 테스트한다.
 *
 * `placeholder` 를 주면 **자리표시자 번호로의 실발송을 막는다.** 존재 검사만으로는
 * 못 막는다 — 자리표시자는 비어 있지 않다. 복붙 경로는 실재한다 — `PLACEHOLDER_PHONE`
 * 상수 정의와 초안 모드가 찍는 연락처 로그. 비교는 숫자만 뽑아서 한다(구분자 차이 무시).
 */
export function sendPreflightOk(opts: SmokeMode & SmokeContacts & { placeholder: string }): boolean {
  // 발송하지 않으면 게이트가 적용되지 않는다 — 초안은 메일도 과금도 없다.
  if (!opts.wantSend) return true;

  const has = (v?: string) => !!v && v.trim() !== '';

  // 이메일은 어느 쪽도 면제되지 않는다: 수신자가 없으면 측정 자체가 성립하지 않는다.
  if (!has(opts.buyerEmail) || !has(opts.pgEmail)) return false;
  // 구매사 번호는 항상 필수 — degrade 가 비우는 칸은 PG 쪽이다.
  if (!has(opts.buyerPhone)) return false;
  if (!opts.wantDegrade && !has(opts.pgPhone)) return false;

  // 자리표시자로 실제 인증 요청이 나가는 것을 막는다 — 이 게이트의 존재 이유 그 자체다.
  const ph = digits(opts.placeholder);
  if (ph !== '' && (digits(opts.buyerPhone) === ph || digits(opts.pgPhone) === ph)) return false;

  return true;
}

/**
 * 그 참여자에게 실릴 번호. `undefined` 면 `resolveSecurityMethod` 가 `PHONE_MISSING` 으로
 * 판정해 `phone`·`security` 키가 **둘 다** 빠진다(= 공급자 기본 이메일 인증).
 *
 * ⚠️ 판정 순서가 load-bearing 이다: degrade 는 `wantSend` 와 env 보다 **먼저** 본다.
 * 뒤로 밀면 `SNOWSIGN_SMOKE_PG_PHONE` 이 설정된 환경에서 degrade 측정이 조용히 깨지고,
 * 최악의 경우 자리표시자가 PG 참여자에 실린다.
 */
export function phoneFor(
  who: 'buyer' | 'pg',
  opts: SmokeMode & SmokeContacts & { placeholder: string },
): string | undefined {
  if (opts.wantDegrade && who === 'pg') return undefined;
  if (!opts.wantSend) return opts.placeholder;
  return who === 'buyer' ? opts.buyerPhone : opts.pgPhone;
}
