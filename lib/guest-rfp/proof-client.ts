let pending: Promise<unknown> = Promise.resolve();

/** Both endpoints can issue the same HttpOnly cookie. Serialize their responses. */
export function withGuestProof<T>(work: () => Promise<T>): Promise<T> {
  const run = () =>
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request("support-b:guest-proof", work)
      : work();
  const result = pending.then(run, run);
  pending = result.catch(() => {});
  return result;
}
