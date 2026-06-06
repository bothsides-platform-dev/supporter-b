import { describe, it, expect } from 'vitest';
import {
  getBidWizardValidity,
  getFirstIncompleteBidStep,
} from '../bid-wizard-validation';

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
