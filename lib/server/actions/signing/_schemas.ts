import { z } from 'zod';

import { SIGNING_TEMPLATE_FIELD_TYPES } from '@/lib/types/signing';

// 액션 간 공유 zod 스키마 — 'use server' 파일은 async 함수만 export 할 수 있어
// (Next.js 제약) 스키마는 이 비-액션 모듈에 둔다(_session/_result 선례).
// 서버 스키마와 에디터가 같은 필드 형태를 쓰는 액션이 둘(create/update)이라
// 복제하면 한쪽만 넓어지는 드리프트가 생긴다. 타입 목록은 런타임 튜플 SSOT 파생.
export const SigningTemplateFieldInputSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(SIGNING_TEMPLATE_FIELD_TYPES),
    party: z.enum(['buyer', 'pg']),
    pageNumber: z.number().int().positive(),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();
