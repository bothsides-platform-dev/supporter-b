import { describe, it, expect } from 'vitest';
import { demoFieldsForStage } from '../demo-stage-fill';

describe('demoFieldsForStage — 자동재생 단계별 누적 채움', () => {
  it('stage 1(사업자 확인)에서는 채울 입력 필드가 없다', () => {
    expect(demoFieldsForStage(1)).toEqual({});
  });

  it('stage 2(견적 내용)에서 핵심 입력을 채운다', () => {
    const f = demoFieldsForStage(2);
    expect(f.title).toBeTruthy();
    expect(f.mainProducts).toBeTruthy();
    expect(f.annualPgVolume).toBeTruthy();
    expect(f.requiredPaymentMethods).toContain('card');
    expect(f.contractType).toBe('new');
  });

  it('stage 3(PG 선택)에서 이전 단계 값을 유지하며 선택 PG를 채운다', () => {
    const f = demoFieldsForStage(3);
    expect(f.title).toBeTruthy(); // 누적
    expect(f.allowedPgWorkspaceIds).toHaveLength(3);
  });

  it('stage 4(보내기 확인)에서 미래 마감일을 채운다', () => {
    const f = demoFieldsForStage(4);
    expect(f.deadline).toBeTruthy();
    expect(new Date(f.deadline as string).getTime()).toBeGreaterThan(Date.now());
  });
});
