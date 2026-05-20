import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Step 14 — Vitest workspace projects.
//
// Two projects share resolve/plugins/setup but pick the right environment per
// test surface. `pnpm test` runs both; `pnpm test --project=unit-node` (or
// `unit-jsdom`) scopes to one for faster local iteration.
//
//   - unit-node    : DB/server/integrations/auth/api routes — `environment: node`
//                    (heavy postgres-js / pglite / fs work that fights jsdom)
//   - unit-jsdom   : React component + hook surface — `environment: jsdom`
//
// `app/api/files/__tests__/*` files self-declare `@vitest-environment node` via
// pragma. Leaving the pragma harmless after the project split — defense in
// depth if someone later moves the file or the include pattern drifts.
//
// We deliberately do NOT set `plugins`/`resolve` at the root: without
// `extends: true` on each project, root entries are inert. Each project
// declares its own (identical) config — explicit > spooky inheritance.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "."),
          },
        },
        test: {
          name: "unit-node",
          environment: "node",
          globals: true,
          // pglite (WASM compile + migrations + queries) is CPU-heavy; under
          // the parallel pool both setup hooks and test bodies can exceed the
          // 10s/5s defaults. Give them room — they pass in <1s uncontended.
          hookTimeout: 30_000,
          testTimeout: 30_000,
          setupFiles: ["./vitest.setup.ts"],
          include: [
            "lib/server/**/*.{test,spec}.{ts,tsx}",
            "lib/integrations/**/*.{test,spec}.{ts,tsx}",
            "lib/auth/**/*.{test,spec}.{ts,tsx}",
            "scripts/**/*.{test,spec}.{ts,tsx}",
            "app/api/**/*.{test,spec}.{ts,tsx}",
          ],
        },
      },
      {
        plugins: [react()],
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "."),
          },
        },
        test: {
          name: "unit-jsdom",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
          include: [
            "components/**/*.{test,spec}.{ts,tsx}",
            "app/(app)/**/*.{test,spec}.{ts,tsx}",
            "app/(public)/**/*.{test,spec}.{ts,tsx}",
            "lib/hooks/**/*.{test,spec}.{ts,tsx}",
            "lib/stores/**/*.{test,spec}.{ts,tsx}",
          ],
        },
      },
    ],
  },
});
