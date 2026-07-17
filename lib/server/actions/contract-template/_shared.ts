// Shared result type for the 2 contract-template (계약서 PDF 템플릿) CRUD actions.
// Session helper comes from lib/server/actions/_session.ts directly.
import type { ActionResult } from '@/lib/server/actions/_result';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ContractTemplateActionResult<T extends object = {}> = ActionResult<T>;
