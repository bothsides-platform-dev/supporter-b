import { describe, it, expect } from 'vitest';
import { pgDemoPageToStepIndex } from '../pg-process-sync';

// PG 데모 창은 4페이지(홈·받은요청·딜룸·메시지), 참여 프로세스는 5스텝이다.
// 창 위 싱크 카드가 보여줄 스텝(0-index)을 페이지에서 결정한다.
// 매핑: 홈→① 파트너등록, 받은요청→② RFP수신, 딜룸→③ 제안제출, 메시지→⑤ 계약논의.
// ④ 고객사 검토는 PG 화면이 없는(구매사 내부) 단계라 카드로는 건너뛰고 스테퍼 노드로만 노출.
describe('pgDemoPageToStepIndex — 데모 페이지 → 프로세스 스텝(0-index) 매핑', () => {
  it('홈(1) → 파트너 등록(0)', () => {
    expect(pgDemoPageToStepIndex(1)).toBe(0);
  });

  it('받은 요청(2) → RFP 수신(1)', () => {
    expect(pgDemoPageToStepIndex(2)).toBe(1);
  });

  it('딜룸(3) → 제안 제출(2)', () => {
    expect(pgDemoPageToStepIndex(3)).toBe(2);
  });

  it('메시지(4) → 계약 논의(4) — 고객사 검토(3)를 건너뛴다', () => {
    expect(pgDemoPageToStepIndex(4)).toBe(4);
  });
});
