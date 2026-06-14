import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { withAxiom } from "next-axiom";
import { SECURITY_HEADERS } from "./lib/security-headers";

// Dev: pipe stdout through pino-pretty: `pnpm dev 2>&1 | pnpm exec pino-pretty`
const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  async redirects() {
    return [
      // 견적 요청 작성을 /rfp/new → /rfp-create 로 이동. 딜룸 모달은 인터셉트
      // 라우트 /rfp/[id] 로 구현되는데, 정적 형제 /rfp/new 가 동적 [id] 인터셉터에
      // 비결정적으로 가로채여(프리페치 의존) 작성 폼 대신 목록이 얼어붙는 문제가
      // 있었다. 작성 경로를 /rfp 네임스페이스 밖으로 빼 충돌을 원천 제거하고,
      // 남은 외부 링크·북마크는 이 리다이렉트로 새 경로에 보낸다.
      { source: "/rfp/new", destination: "/rfp-create", permanent: false },
    ];
  },
  // Prevent pino (and its worker-thread transport) from being bundled for Edge.
  serverExternalPackages: ["pino", "pino-pretty", "@axiomhq/pino"],
  // Allow lvh.me (wildcard DNS → 127.0.0.1) as a trusted dev origin so local
  // cross-subdomain dev (buyer=lvh.me:3000, pg=partner.lvh.me:3000) works with
  // Next.js's CSRF-style origin check on cross-origin Server Action requests.
  allowedDevOrigins: ["lvh.me", "*.lvh.me"],
  // Next 16 acquires a `<distDir>/dev/lock` per `next dev` and refuses a second
  // dev server in the same dir *even on a different port*. The e2e webServer
  // (playwright.config.ts) starts `next dev --port 3001`; without an isolated
  // distDir it collides with a developer's local `pnpm dev` on :3000 and fails
  // to boot ("Another next dev server is already running"). NEXT_DIST_DIR lets
  // the e2e server build into `.next-e2e`, giving it its own lock + build cache.
  // Unset → default `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default withSentryConfig(withAxiom(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },
});
