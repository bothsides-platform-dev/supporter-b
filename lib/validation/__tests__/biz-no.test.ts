import { describe, it, expect } from 'vitest';
import { isValidBizNo } from '../biz-no';

describe('isValidBizNo', () => {
  it('유효한 사업자번호를 통과시킨다 (삼성전자: 124-81-00998)', () => {
    expect(isValidBizNo('1248100998')).toBe(true);
  });

  it('하이픈 포함 형식도 통과시킨다', () => {
    expect(isValidBizNo('124-81-00998')).toBe(true);
  });

  it('체크섬이 틀린 번호는 거부한다', () => {
    expect(isValidBizNo('1248100997')).toBe(false); // 마지막 자리 1 바꿈
  });

  it('10자리가 아닌 번호는 거부한다', () => {
    expect(isValidBizNo('123456789')).toBe(false);   // 9자리
    expect(isValidBizNo('12345678901')).toBe(false);  // 11자리
    expect(isValidBizNo('')).toBe(false);
  });

  it('체크섬이 틀린 번호(마지막 자리 변조)는 거부한다', () => {
    // 0000000001: check=(10-0)%10=0, d[9]=1 → 불일치
    expect(isValidBizNo('0000000001')).toBe(false);
  });

  it('모두 0인 번호는 체크섬 알고리즘상 유효하다', () => {
    // 0*1+...+0*5=0, floor(0*5/10)=0, check=(10-0)%10=0, d[9]=0 → 일치
    expect(isValidBizNo('0000000000')).toBe(true);
  });

  it('유효한 다른 사업자번호를 통과시킨다 (네이버: 220-81-04521)', () => {
    // sum=48, floor(2*5/10)=1, sum=49, check=(10-9)%10=1, d[9]=1 ✓
    expect(isValidBizNo('2208104521')).toBe(true);
  });

  it('공백 포함 번호도 처리한다', () => {
    expect(isValidBizNo('124 81 00998')).toBe(true);
  });
});
