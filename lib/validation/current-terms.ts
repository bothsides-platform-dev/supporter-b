import { z } from 'zod';
import { SOLUTION_VALUES } from '@/lib/types/rfp-terms';

// RFP 현재조건 문서(rfps.current_terms)의 쓰기-엣지 제약 계층 — 컬럼 NOT NULL/length CHECK 대체.
// 현재(Phase A-D)는 쓰기 경계가 개별 current_* 컬럼(createRfpAction 의 기존 flat zod)이라 dual-write
// 가 만든 문서는 기존 데이터에서 파생되어 별도 검증하지 않는다(레거시 값 throw 방지). 이 스키마는
// 쓰기 권위가 문서로 넘어가는 Phase E(액션 doc 조립) 의 검증 지점으로 배선될 예정. solution 어휘는
// rfp-terms.ts SOLUTION_VALUES 단일 출처에서 파생한다. 새 브리프 필드 = 여기 + rfp-terms.ts 둘만.
export const currentTermsV1Schema = z
  .object({
    _v: z.literal(1),
    feeRate: z.string().max(50).optional(),
    settlementLimit: z.string().max(100).optional(),
    guaranteeInsurance: z.string().max(100).optional(),
    settlementCycle: z.string().max(50).optional(),
    deliveryServicePeriod: z.string().max(100).optional(),
    solution: z.enum(SOLUTION_VALUES).optional(),
    solutionDetail: z.string().max(100).optional(),
    annualPgVolume: z.string().max(100).optional(),
  })
  .strict();
