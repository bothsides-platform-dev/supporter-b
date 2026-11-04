// 견적 요청 입력 — 서버 파싱. wire 입력을 검증된 모양으로 바꾸고, 거부 사유를
// 액션 오류 코드로 판별한다. 서버 전용(`schema.ts` 가 tldts 를 끌어온다).
import {
  isValidWebsiteUrlLight,
  normalizeWebsiteUrl,
} from "@/lib/validation/website-url";
import { createRfpInputSchema, type ParsedCreateRfpInput } from "./schema";

export type ParseCreateRfpInputResult =
  | { ok: true; data: ParsedCreateRfpInput }
  | { ok: false; error: "INVALID_INPUT" | "INVALID_WEBSITE" };

/**
 * 거부 사유 판별:
 * - 경량 검증은 통과하지만 서버 정밀 검증(TLD 체크)에서만 거부된 websiteUrl →
 *   `INVALID_WEBSITE`. 클라이언트가 잡지 못한 "존재하지 않는 TLD" 오류이므로
 *   위저드가 홈페이지 질문의 필드 오류로 표면화한다.
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
    return { ok: false, error: websiteServerRejected ? "INVALID_WEBSITE" : "INVALID_INPUT" };
  }
  const websiteUrl = parsed.data.websiteUrl
    ? normalizeWebsiteUrl(parsed.data.websiteUrl.trim()) || undefined
    : undefined;
  return { ok: true, data: { ...parsed.data, websiteUrl } };
}
