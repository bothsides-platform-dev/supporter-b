import { describe, it, expect } from 'vitest';
import {
  getBidWizardValidity,
  getFirstIncompleteBidStep,
  isCycleValid,
  isFeeFilled,
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

describe('getBidWizardValidity', () => {
  it('정산주기 미입력 + 수수료 없음 → 1·2단계 미완료, 3·4단계 완료', () => {
    const v = getBidWizardValidity({ cycleNum: '', anyFeeFilled: false });
    expect(v.map((s) => s.complete)).toEqual([false, false, true, true]);
  });

  it('정산주기 입력 + 수수료 1개 이상 → 전부 완료', () => {
    const v = getBidWizardValidity({ cycleNum: '1', anyFeeFilled: true });
    expect(v.map((s) => s.complete)).toEqual([true, true, true, true]);
  });

  it('cycleNum 0 은 1단계 미완료', () => {
    const v = getBidWizardValidity({ cycleNum: '0', anyFeeFilled: true });
    expect(v[0].complete).toBe(false);
  });
});

describe('getFirstIncompleteBidStep', () => {
  it('정산주기 미입력 시 1단계와 힌트 반환', () => {
    const s = getFirstIncompleteBidStep({ cycleNum: '', anyFeeFilled: true });
    expect(s?.num).toBe(1);
    expect(s?.hint).toContain('정산');
  });

  it('정산주기만 있고 수수료 없으면 2단계 반환', () => {
    const s = getFirstIncompleteBidStep({ cycleNum: '1', anyFeeFilled: false });
    expect(s?.num).toBe(2);
  });

  it('모두 충족 시 null', () => {
    expect(getFirstIncompleteBidStep({ cycleNum: '1', anyFeeFilled: true })).toBeNull();
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
