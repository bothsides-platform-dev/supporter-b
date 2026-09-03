// Shared helpers for the buyer-side RFP actions.
//
// 액션은 DB 핸들을 만지지 않는다 — 트랜잭션은 서비스(`getRfpService()` 등)가
// `repositories/factory` 의 `getDb()` 로 연다. 옛 `actionDb()` 재export 는 사라졌다.
//
// (Step 10 정리) 기존 `devLogRfpInviteLink` 헬퍼는 삭제됐다 — 동일한 dev 콘솔
// 폴백은 `lib/integrations/resend.ts:ResendSender`가 `RESEND_API_KEY` 부재 시
// `[email DEV] event=... to=... subject=... dedupeKey=...` 한 줄을 출력하는
// 것으로 통합됐다. Action 레이어에서는 더 이상 invite URL을 직접 로깅하지
// 않는다.

import type { ActionResult } from '@/lib/server/actions/_result';

// `T` defaults to {} so callers without payload can write `RfpActionResult`.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type RfpActionResult<T extends object = {}> = ActionResult<T>;
