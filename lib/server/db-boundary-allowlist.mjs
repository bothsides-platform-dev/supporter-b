// Single source of truth for the repository-boundary exception allowlist.
//
// All DB access is owned by `lib/server/repositories/**`. Everywhere else under
// `lib/`/`app/` is forbidden from statically VALUE-importing `@/lib/db/schema`
// or `@/lib/db/client` (`import type { DB }` is fine; dynamic `import()` in
// services for the tx handle is fine). This list is the small set of files that
// are deliberately exempt — each for a documented, irreducible reason.
//
// Consumed by BOTH `eslint.config.mjs` (the `repo-boundary/db-access` rule's
// `ignores`, bracket-escaped for minimatch) AND `lib/server/__tests__/repo-boundary.test.ts`
// (an independent fs-walk drift guard), so the two can never diverge. Add an
// entry here ONLY with a reviewed justification — widening the boundary should
// be visible in one obvious place.
//
// Paths are repo-relative, UNESCAPED on-disk paths.
export const DB_BOUNDARY_ALLOWLIST = [
  // Cross-aggregate cascade delete — purges user + workspace + memberships +
  // bizProfiles + sample RFPs + verification tokens in one service-owned tx;
  // no single repo can own a cross-aggregate cascade.
  'lib/server/actions/auth/_purgeUnverifiedSignup.ts',
  // actionDb() test-override registry — supplies the prod `db` handle (or a
  // pglite test double) into action transactions. Still used by 6 actions.
  'lib/server/actions/auth/_shared.ts',
];
