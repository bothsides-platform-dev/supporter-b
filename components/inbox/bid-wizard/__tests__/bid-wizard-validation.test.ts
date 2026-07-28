import { describe, it, expect } from 'vitest';
import {
  deriveAnyFeeFilled,
  getBidWizardValidity,
  getFirstIncompleteBidStep,
  isCycleValid,
  isFeeFilled,
  isSettleLimitValid,
} from '../bid-wizard-validation';

// 수수료 칸이 "채워졌다"의 판정 — 진행률 표시(BidStepFees)와 제출 가능 판정
// (deriveAnyFeeFilled)이 같은 기준을 써야 한다. 다르면 진행률은 100%인데 제출은
// 막히는(또는 그 반대) 어긋남이 난다.
describe('isFeeFilled', () => {
  it('값이 있으면 채워진 것으로 본다', () => {
    expect(isFeeFilled({ card: '2.5' }, 'card')).toBe(true);
  });

  it('0 도 채워진 것으로 본다 (무료 수수료는 유효한 제안)', () => {
    expect(isFeeFilled({ card: '0' }, 'card')).toBe(true);
  });

  it('빈 문자열·미입력 키는 채워지지 않은 것으로 본다', () => {
    expect(isFeeFilled({ card: '' }, 'card')).toBe(false);
    expect(isFeeFilled({}, 'card')).toBe(false);
  });

  it('음수는 채워지지 않은 것으로 본다', () => {
    expect(isFeeFilled({ card: '-1' }, 'card')).toBe(false);
  });
});

// 조합 축 — 스칼라 판정(isFeeFilled)이 아니라 "선택된 수단·구간·커스텀 수단을
// 어떻게 순회하는가"를 고정한다. fees 키 규약: 구간제 수단은 `"<method>:<tier>"`,
// 단일 수단·커스텀은 키 그대로.
describe('deriveAnyFeeFilled', () => {
  it('빈 fees·수단 없음 → false', () => {
    expect(deriveAnyFeeFilled({}, [], [])).toBe(false);
  });

  it('구간제 수단은 여러 구간 중 하나만 채워져도 true', () => {
    expect(deriveAnyFeeFilled({ 'card:sme2': '1.2' }, ['card'], [])).toBe(true);
  });

  it('구간제 수단에 구간 없는 평키만 채우면 false (키 규약 위반은 미입력)', () => {
    expect(deriveAnyFeeFilled({ card: '1.2' }, ['card'], [])).toBe(false);
  });

  it('선택되지 않은 수단의 값은 무시된다', () => {
    expect(deriveAnyFeeFilled({ 'card:sole': '0.8' }, ['virtual_account'], [])).toBe(false);
    expect(deriveAnyFeeFilled({ virtual_account: '300' }, ['card'], [])).toBe(false);
  });

  it('비구간 단일 수단은 키 그대로 채우면 true', () => {
    expect(deriveAnyFeeFilled({ virtual_account: '300' }, ['virtual_account'], [])).toBe(true);
  });

  it('커스텀 수단은 id 키로 채우면 true', () => {
    expect(deriveAnyFeeFilled({ 'custom-1': '2.0' }, [], [{ id: 'custom-1' }])).toBe(true);
  });

  it('커스텀 수단이 있어도 값이 비면 false', () => {
    expect(deriveAnyFeeFilled({ 'custom-1': '' }, [], [{ id: 'custom-1' }])).toBe(false);
  });

  it('여러 수단 중 하나라도 채워지면 true (음수·빈칸은 미입력)', () => {
    expect(
      deriveAnyFeeFilled(
        { 'card:sole': '-1', virtual_account: '', 'custom-1': '0' },
        ['card', 'virtual_account'],
        [{ id: 'custom-1' }],
      ),
    ).toBe(true);
  });
});

describe('getBidWizardValidity', () => {
  it('정산주기 미입력 + 수수료 없음 → 1·2단계 미완료, 3·4단계 완료', () => {
    const v = getBidWizardValidity({ cycleNum: '', settleLimit: '1000000', anyFeeFilled: false });
    expect(v.map((s) => s.complete)).toEqual([false, false, true, true]);
  });

  it('정산주기 입력 + 수수료 1개 이상 → 전부 완료', () => {
    const v = getBidWizardValidity({ cycleNum: '1', settleLimit: '1000000', anyFeeFilled: true });
    expect(v.map((s) => s.complete)).toEqual([true, true, true, true]);
  });

  it('cycleNum 0 은 1단계 미완료', () => {
    const v = getBidWizardValidity({ cycleNum: '0', settleLimit: '1000000', anyFeeFilled: true });
    expect(v[0].complete).toBe(false);
  });

  // 정산한도 0 은 '한도 없음'이 아니라 '정산 불가'로 읽힌다 — 구매사 비교 패널이
  // 그대로 `0원`을 찍기 때문에 애초에 입력 단계에서 막는다.
  it('정산한도 0 은 정산주기가 유효해도 1단계 미완료', () => {
    const v = getBidWizardValidity({ cycleNum: '1', settleLimit: '0', anyFeeFilled: true });
    expect(v[0].complete).toBe(false);
  });
});

describe('getFirstIncompleteBidStep', () => {
  it('정산주기 미입력 시 1단계와 힌트 반환', () => {
    const s = getFirstIncompleteBidStep({ cycleNum: '', settleLimit: '1000000', anyFeeFilled: true });
    expect(s?.num).toBe(1);
    expect(s?.hint).toContain('정산');
  });

  it('정산주기만 있고 수수료 없으면 2단계 반환', () => {
    const s = getFirstIncompleteBidStep({ cycleNum: '1', settleLimit: '1000000', anyFeeFilled: false });
    expect(s?.num).toBe(2);
  });

  // 1단계 힌트는 실제로 빈 칸만 짚어야 한다 — 이미 채운 칸까지 이름을 대면
  // "정산 주기는 '입력 완료'인데 왜 또 입력하라는 거지"가 된다.
  it('정산한도만 비면 정산한도만 짚는다', () => {
    const s = getFirstIncompleteBidStep({ cycleNum: '1', settleLimit: '', anyFeeFilled: true });
    expect(s?.num).toBe(1);
    expect(s?.hint).toBe('정산한도를 입력해주세요');
  });

  it('정산주기만 비면 정산주기만 짚는다', () => {
    const s = getFirstIncompleteBidStep({
      cycleNum: '',
      settleLimit: '50000000',
      anyFeeFilled: true,
    });
    expect(s?.hint).toBe('정산 주기를 입력해주세요');
  });

  it('둘 다 비면 둘 다 짚는다', () => {
    const s = getFirstIncompleteBidStep({ cycleNum: '', settleLimit: '', anyFeeFilled: true });
    expect(s?.hint).toBe('정산 주기와 정산한도를 입력해주세요');
  });

  it('모두 충족 시 null', () => {
    expect(
      getFirstIncompleteBidStep({ cycleNum: '1', settleLimit: '1000000', anyFeeFilled: true }),
    ).toBeNull();
  });
});

describe('isSettleLimitValid', () => {
  it('빈 문자열은 무효', () => {
    expect(isSettleLimitValid('')).toBe(false);
  });
  it('0 은 무효 — 0원 한도는 정산 불가로 읽힌다', () => {
    expect(isSettleLimitValid('0')).toBe(false);
  });
  it('음수는 무효', () => {
    expect(isSettleLimitValid('-1')).toBe(false);
  });
  it('0 초과는 유효', () => {
    expect(isSettleLimitValid('1')).toBe(true);
    expect(isSettleLimitValid('50000000')).toBe(true);
  });
});

describe('isCycleValid', () => {
  it('빈 문자열은 무효', () => {
    expect(isCycleValid('')).toBe(false);
  });
  it('0 이하는 무효', () => {
    expect(isCycleValid('0')).toBe(false);
  });
  it('양의 정수는 유효', () => {
    expect(isCycleValid('3')).toBe(true);
  });
});
