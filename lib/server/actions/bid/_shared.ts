// Shared helpers for the 2 PG-side bid actions.
//
// - `actionDb()`/`baseUrl()`는 auth/_shared.ts 의 것을 그대로 재사용.
// - 모든 'use server' 액션은 `Promise<BidActionResult>` 시그니처. caller는
//   `r.ok` discriminated union으로 분기.

export { actionDb, baseUrl } from '../auth/_shared';
