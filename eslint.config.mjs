import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import unusedImports from "eslint-plugin-unused-imports";
import { DB_BOUNDARY_ALLOWLIST } from "./lib/server/db-boundary-allowlist.mjs";

// Allowlist paths are stored unescaped (real on-disk paths). minimatch treats
// [id]/[token] dynamic segments as char-classes, so escape the brackets when
// feeding them to ESLint `ignores`. Route-group parens (app)/(public) are
// literal in minimatch and need no escaping.
const escapeGlob = (p) => p.replace(/[[\]]/g, (c) => "\\" + c);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { "unused-imports": unusedImports },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          vars: "all",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Repository boundary: forbid direct DB access outside the repo layer.
  // Static value imports of @/lib/db/{schema,client} are owned by
  // lib/server/repositories/**. `import type { DB }` is allowed everywhere;
  // services use dynamic import('@/lib/db/client') (not matched here) for tx.
  {
    name: "repo-boundary/db-access",
    files: ["lib/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    ignores: [
      "lib/server/repositories/**",
      "**/__tests__/**",
      "**/*.test.{ts,tsx}",
      ...DB_BOUNDARY_ALLOWLIST.map(escapeGlob),
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/db/schema", "@/lib/db/client"],
              allowTypeImports: true,
              message:
                "DB access is owned by lib/server/repositories/**. Inject a repo " +
                "via repositories/factory instead of importing @/lib/db/* directly. " +
                "Type-only imports (import type { DB }) are allowed; services may use " +
                "dynamic import('@/lib/db/client') for the tx handle. A genuine new " +
                "exception must be added to lib/server/db-boundary-allowlist.mjs (reviewed).",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worktrees are separate checkouts — not part of this workspace's lint surface.
    ".claude/**",
    ".worktrees/**",
  ]),
]);

export default eslintConfig;
