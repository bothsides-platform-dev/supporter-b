// Shared helpers for the 2 PG-side bid actions.
//
// - `actionDb()`/`baseUrl()`는 auth/_shared.ts 의 것을 그대로 재사용.
// - 모든 'use server' 액션은 `Promise<BidActionResult>` 시그니처. caller는
//   `r.ok` discriminated union으로 분기.

export { actionDb, baseUrl } from '../auth/_shared';
import type { ActionResult } from '@/lib/server/actions/_result';

// `T` defaults to {} so callers without payload can write `BidActionResult`.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type BidActionResult<T extends object = {}> = ActionResult<T>;
