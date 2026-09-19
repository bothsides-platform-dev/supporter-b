import type { PaymentMethod } from '@/lib/types/bid';
import type { PgWorkspaceItem } from '@/lib/stores/rfp-draft';
import { fixturePgs, fixtureSelectedPgIds } from './demo-fixtures';

// 자동재생이 각 단계에 진입할 때 draft store에 누적 적용할 데모 입력값.
// 실제 사용자가 채워 넣는 것처럼 단계가 넘어갈수록 마법사가 채워진다.
export type DemoDraftFields = {
  title: string;
  websiteUrl: string;
  mainProducts: string;
  industryGroupId: string;
  annualPgVolume: string;
  currentFeeRate: string;
  contractType: 'new' | 'renewal';
  requiredPaymentMethods: PaymentMethod[];
  allowedPgWorkspaceIds: PgWorkspaceItem[];
  deadline: string;
};

const STAGE2: Partial<DemoDraftFields> = {
  title: '2026 결제 인프라 견적 요청',
  websiteUrl: 'https://noon.example.com',
  mainProducts: '의류',
  industryGroupId: 'demo-shopping',
  annualPgVolume: '1000000000',
  currentFeeRate: '3.4',
  contractType: 'renewal',
  requiredPaymentMethods: ['card'],
};

const STAGE3: Partial<DemoDraftFields> = {
  allowedPgWorkspaceIds: fixtureSelectedPgIds.map((id) => {
    const w = fixturePgs.find((p) => p.id === id)!;
    return { id: w.id, displayName: w.displayName, logoUpdatedAt: w.logoUpdatedAt };
  }),
};

export function demoFieldsForStage(stage: number): Partial<DemoDraftFields> {
  let fields: Partial<DemoDraftFields> = {};
  if (stage >= 2) fields = { ...fields, ...STAGE2 };
  if (stage >= 3) {
    fields = {
      ...fields,
      ...STAGE3,
      // 항상 미래로 — 데모가 언제 열려도 마감일이 유효하게 보인다.
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  return fields;
}
