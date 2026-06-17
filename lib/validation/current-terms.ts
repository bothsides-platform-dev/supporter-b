import { z } from 'zod';

// RFP 현재조건 문서(rfps.current_terms)의 쓰기 시점 제약 계층.
// 컬럼 NOT NULL/length CHECK 를 대신한다 — 새 브리프 필드는 여기 + lib/types/rfp-terms.ts 둘만 수정.
export const currentTermsV1Schema = z
  .object({
    _v: z.literal(1),
    feeRate: z.string().max(50).optional(),
    settlementLimit: z.string().max(100).optional(),
    guaranteeInsurance: z.string().max(100).optional(),
    settlementCycle: z.string().max(50).optional(),
    deliveryServicePeriod: z.string().max(100).optional(),
    solution: z.enum(['cafe24', 'imweb', 'makeshop', 'godo', 'self', 'other']).optional(),
    solutionDetail: z.string().max(100).optional(),
    annualPgVolume: z.string().max(100).optional(),
  })
  .strict();
