// Postgres unique-violation (23505) detector that works in BOTH runtimes:
// postgres-js (prod) exposes `.code` directly; pglite (tests) nests it under
// `.cause.code`.
export function isUniqueViolation(err: unknown): boolean {
  const direct = (err as { code?: unknown } | null)?.code;
  const nested = (err as { cause?: { code?: unknown } } | null)?.cause?.code;
  return direct === '23505' || nested === '23505';
}
