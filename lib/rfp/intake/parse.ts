// 견적 요청 입력 — 서버 파싱. wire 입력을 검증된 모양으로 바꾸고, 거부 사유를
// 액션 오류 코드로 판별한다. 서버 전용(`schema.ts` 가 tldts 를 끌어온다).
import {
  isValidWebsiteUrlLight,
  normalizeWebsiteUrl,
} from "@/lib/validation/website-url";
import type { SendReadinessRule } from "@/lib/rfp/send-readiness";
import { createRfpInputSchema, type ParsedCreateRfpInput } from "./schema";

export type ParseCreateRfpInputError =
  | "INVALID_INPUT"
  | "INVALID_WEBSITE"
  | "MATCHING_REQUIRED"
  | "CURRENT_PGS_REQUIRED";

export type ParseCreateRfpInputResult =
  | { ok: true; data: ParsedCreateRfpInput }
  | { ok: false; error: ParseCreateRfpInputError };

// 발송 전제 미충족 중 서비스가 고유 코드로 알려 온 두 규칙은 스키마 단계에서도 같은 코드를
// 돌려준다. 다른 입력 오류가 함께 있으면 종전처럼 INVALID_INPUT 이 먼저다.
const SERVICE_CODES: Partial<Record<SendReadinessRule, ParseCreateRfpInputError>> = {
  industry: "MATCHING_REQUIRED",
  "current-pgs": "CURRENT_PGS_REQUIRED",
};

function readinessErrorCode(issues: readonly { code: string; params?: unknown }[]): ParseCreateRfpInputError {
  const codes = issues.map((issue) => {
    const rule = issue.code === "custom" ? (issue.params as { rule?: SendReadinessRule } | undefined)?.rule : undefined;
    return rule === undefined ? undefined : SERVICE_CODES[rule];
  });
  if (codes.some((code) => code === undefined)) return "INVALID_INPUT";
  return codes[0] ?? "INVALID_INPUT";
}

/**
 * 거부 사유 판별:
 * - 경량 검증은 통과하지만 서버 정밀 검증(TLD 체크)에서만 거부된 websiteUrl →
 *   `INVALID_WEBSITE`. 클라이언트가 잡지 못한 "존재하지 않는 TLD" 오류이므로
 *   위저드가 홈페이지 질문의 필드 오류로 표면화한다.
 * - 발송 전제(lib/rfp/send-readiness) 중 업종·현재 PG 만 미충족 → 서비스와 같은
 *   `MATCHING_REQUIRED` / `CURRENT_PGS_REQUIRED`.
 * - 그 외 모든 입력 오류(빈 값 필수 위반, 결제수단 누락 등) → `INVALID_INPUT`.
 *
 * 통과한 입력의 websiteUrl 은 저장 직전 형태(스킴 보강)로 정규화해 돌려준다.
 */
export function parseCreateRfpInput(input: unknown): ParseCreateRfpInputResult {
  const parsed = createRfpInputSchema.safeParse(input);
  if (!parsed.success) {
    const rawWebsite =
      typeof input === "object" && input !== null && "websiteUrl" in input && typeof input.websiteUrl === "string"
        ? input.websiteUrl.trim()
        : "";
    const websiteServerRejected =
      rawWebsite !== "" &&
      isValidWebsiteUrlLight(rawWebsite) &&
      parsed.error.issues.some((issue) => issue.path[0] === "websiteUrl");
    return { ok: false, error: websiteServerRejected ? "INVALID_WEBSITE" : readinessErrorCode(parsed.error.issues) };
  }
  const websiteUrl = parsed.data.websiteUrl
    ? normalizeWebsiteUrl(parsed.data.websiteUrl.trim()) || undefined
    : undefined;
  return { ok: true, data: { ...parsed.data, websiteUrl } };
}
