import type {
  requireActiveWorkspace as Active,
  requirePgActor as Pg,
} from "./_session";
/** Removed PG contract entry points stay callable only to return a stable rejection. */
export async function requireActiveWorkspace(): ReturnType<typeof Active> {
  return { ok: false, error: "CONTRACT_FEATURE_REMOVED" };
}
export async function requirePgActor(): ReturnType<typeof Pg> {
  return { ok: false, error: "CONTRACT_FEATURE_REMOVED" };
}
