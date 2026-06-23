// Shared helpers for the 7 buyer-side RFP actions.
//
// `actionDb()`/`baseUrl()`는 auth/_shared.ts 의 것을 그대로 재사용. Auth 액션과
// 동일한 testdb 핸들 override가 적용되도록 단일 globalThis 키
// (`__bidit_action_db_override__`) 로 통일.
//
// (Step 10 정리) 기존 `devLogRfpInviteLink` 헬퍼는 삭제됐다 — 동일한 dev 콘솔
// 폴백은 `lib/integrations/resend.ts:ResendSender`가 `RESEND_API_KEY` 부재 시
// `[email DEV] event=... to=... subject=... dedupeKey=...` 한 줄을 출력하는
// 것으로 통합됐다. Action 레이어에서는 더 이상 invite URL을 직접 로깅하지
// 않는다.

export { actionDb, baseUrl } from '../auth/_shared';
import type { ActionResult } from '@/lib/server/actions/_result';

// `T` defaults to {} so callers without payload can write `RfpActionResult`.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type RfpActionResult<T extends object = {}> = ActionResult<T>;
