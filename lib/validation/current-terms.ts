import { z } from 'zod';
import { SOLUTION_VALUES } from '@/lib/types/rfp-terms';

// RFP 현재조건 문서(rfps.current_terms)의 쓰기-엣지 제약 계층 — 컬럼 NOT NULL/length CHECK 대체.
// createRfpAction 의 flat zod 가 현재조건 필드를 검증하지만 이 스키마는 미배선 상태(P3 TODO).
// solution 어휘는 rfp-terms.ts SOLUTION_VALUES 단일 출처에서 파생한다.
// 새 브리프 필드 = 여기 + rfp-terms.ts 둘만.
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
