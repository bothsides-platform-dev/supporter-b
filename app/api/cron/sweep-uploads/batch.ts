/**
 * Per-tick bound for the abandoned-upload sweep.
 *
 * Lives in its own module so the route and its test share one source — a
 * literal duplicated into the test would let the two drift and quietly make
 * the bound untested.
 *
 * Sized so a tick finishes well inside a platform function timeout: the object
 * deletes are one remote round-trip each, so ~200 × ~50ms ≈ 10s worst case.
 * Anything left over is still `pending` and gets swept on the next run.
 */
export const SWEEP_BATCH = 200;
