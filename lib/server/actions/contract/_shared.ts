// Shared result type for the 7 e-contract document lifecycle actions
// (send/sign/recordView/decline/cancel/reassignSigner/verify). Session
// helpers come from lib/server/actions/_session.ts directly (no local
// re-derivation) — mirrors chat/_shared.ts's re-export convention.
import type { ActionResult } from '@/lib/server/actions/_result';

// `T` defaults to {} so callers without payload can write `ContractActionResult`.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ContractActionResult<T extends object = {}> = ActionResult<T>;
