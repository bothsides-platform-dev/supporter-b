import type { ActionResult } from '@/lib/server/actions/_result';

export { actionDb, baseUrl } from '../auth/_shared';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type WorkspaceActionResult<T extends object = {}> = ActionResult<T>;
