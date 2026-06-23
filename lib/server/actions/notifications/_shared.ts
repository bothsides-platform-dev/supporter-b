// Shared helpers for notification actions (mark-read / mark-all-read /
// retry-email). actionDb / baseUrl는 auth/_shared.ts 그대로 재사용.

export { actionDb, baseUrl } from '../auth/_shared';
import type { ActionResult } from '@/lib/server/actions/_result';

// `T` defaults to {} so callers without payload can write `NotificationActionResult`.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type NotificationActionResult<T extends object = {}> = ActionResult<T>;
