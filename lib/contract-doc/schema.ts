// `ContractDoc` 의 zod 스키마 — **저장 액션과 미리보기 라우트가 공유한다.**
//
// 두 입구가 각자 스키마를 들면 한쪽만 넓어져 "미리보기는 되는데 저장이 안 되는"
// (혹은 그 반대의) 문서가 생긴다. `_schemas.ts`(서명칸 필드)와 같은 이유로 액션이
// 아닌 모듈에 둔다 — `'use server'` 파일은 async 함수만 export 할 수 있다.

import { z } from 'zod';

import {
  MAX_BODY_LENGTH,
  MAX_CLAUSES,
  MAX_HEADING_LENGTH,
  MAX_SECTION_LENGTH,
} from './limits';

const heading = z.string().max(MAX_HEADING_LENGTH);
const body = z.string().max(MAX_BODY_LENGTH);

/**
 * 조항 — `kind` 로 갈리는 판별 유니온.
 *
 * `discriminatedUnion` 을 쓰는 것이 중요하다: 느슨한 union 이면 `kind:'text'` 인데
 * `intro` 가 실린 객체가 통과해 렌더가 조용히 그 필드를 잃는다.
 */
export const ContractClauseSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id: z.string().min(1),
      kind: z.literal('text'),
      heading,
      body,
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      kind: z.literal('feeTable'),
      heading,
      intro: body,
      outro: body,
    })
    .strict(),
]);

export const ContractDocSchema = z
  .object({
    _v: z.literal(1),
    title: z.string().max(MAX_SECTION_LENGTH),
    preamble: z.string().max(MAX_SECTION_LENGTH),
    clauses: z.array(ContractClauseSchema).max(MAX_CLAUSES),
    closing: z.string().max(MAX_SECTION_LENGTH),
  })
  .strict();
