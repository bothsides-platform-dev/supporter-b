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
  // services take their tx handle from repositories/factory `getDb()`.
  //
  // ⚠ Flat config does NOT merge rule options — the last block matching a file
  // replaces `no-restricted-imports` wholesale. Every pattern this surface must
  // enforce therefore lives in THIS one block (DB boundary + pdfjs SSR safety);
  // a separate lib/app block for pdfjs once silently erased the DB guard here.
  // Effective-config guard: lib/server/__tests__/eslint-effective-boundary.test.ts.
  // Trade-off: files this block ignores (repo layer, DB allowlist) also skip the
  // pdfjs pattern — accepted, they are server-only code that never renders.
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
                "Type-only imports (import type { DB }) are allowed; services take " +
                "their tx handle from repositories/factory getDb(). A genuine new " +
                "exception must be added to lib/server/db-boundary-allowlist.mjs (reviewed).",
            },
            {
              group: ["pdfjs-dist", "pdfjs-dist/*"],
              allowTypeImports: true,
              message:
                "pdfjs-dist evaluates DOM globals (DOMMatrix) at module scope and " +
                "crashes Node SSR. It may only be imported by " +
                "components/contract-templates/ContractTemplateEditor.tsx, which is " +
                "loaded via next/dynamic({ ssr: false }). Put a new consumer behind " +
                "the same ssr:false boundary and add it to this rule's ignores (reviewed).",
            },
          ],
        },
      ],
    },
  },
  // SSR-safety boundary: pdfjs-dist runs `new DOMMatrix()` at module scope and
  // dies at import time in Node — a static import anywhere in a page's client
  // module graph 500s that route's SSR (실사고: /contract-templates, v0.4.41.2).
  // Consumption is confined to ContractTemplateEditor, which is only loaded via
  // next/dynamic({ ssr: false }). New consumers go behind the same boundary and
  // extend this ignores list with review.
  //
  // Scope is components/** ONLY — lib/** and app/** get this same pdfjs pattern
  // from the repo-boundary/db-access block above. Widening `files` here would
  // clobber that block's DB patterns (flat config: last matching block wins the
  // whole rule; guarded by lib/server/__tests__/eslint-effective-boundary.test.ts).
  {
    name: "ssr-boundary/pdfjs",
    files: ["components/**/*.{ts,tsx}"],
    ignores: [
      "components/contract-templates/ContractTemplateEditor.tsx",
      "**/__tests__/**",
      "**/*.test.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["pdfjs-dist", "pdfjs-dist/*"],
              allowTypeImports: true,
              message:
                "pdfjs-dist evaluates DOM globals (DOMMatrix) at module scope and " +
                "crashes Node SSR. It may only be imported by " +
                "components/contract-templates/ContractTemplateEditor.tsx, which is " +
                "loaded via next/dynamic({ ssr: false }). Put a new consumer behind " +
                "the same ssr:false boundary and add it to this rule's ignores (reviewed).",
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
