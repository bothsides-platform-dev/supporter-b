import { z } from "zod";
import {
  EVENTS,
  STEPS,
  ERRORS,
  type FunnelEvent,
  type FunnelParams,
} from "@/lib/analytics/funnel-definitions";
import { CLARITY_PROJECT_ID } from "./clarity";
const permitsAnswer = (funnel: string, step: string) =>
  funnel === "questions" ||
  (funnel === "signup" && ["email", "company", "profile", "phone"].includes(step));
const browserNames = EVENTS.filter(
  (name) => name !== "sign_up" && name !== "quote_request_submitted",
);
export const journeyEventSchema = z
  .object({
    id: z.string().uuid(),
    observedAt: z.string().datetime(),
    name: z.enum(browserNames),
    funnel_id: z.enum(["acquisition", "questions", "signup", "request"]),
    step_id: z.string().max(40),
    mode: z.enum(["write", "edit"]).optional(),
    progression: z.enum(["next", "skip"]).optional(),
    error_code: z.enum(ERRORS).optional(),
    answer: z.string().max(500).optional(),
  })
  .strict()
  .refine(d => d.answer === undefined || (
    permitsAnswer(d.funnel_id, d.step_id) &&
    d.name === "funnel_step_complete" && d.progression !== "skip"
  ))
  .refine((d) => (STEPS[d.funnel_id] as readonly string[]).includes(d.step_id))
  // These successes are authoritative server events, including aliases.
  .refine(
    (d) =>
      !(
        d.name === "funnel_step_complete" &&
        (d.step_id === "account_created" || d.step_id === "submitted")
      ),
  );
export type JourneyEvent = z.infer<typeof journeyEventSchema>;
export type StoredJourneyEvent = Omit<JourneyEvent, "name"> & {
  name: JourneyEvent["name"] | "sign_up" | "quote_request_submitted";
};
export const journeyAnalyticsSchema = z
  .object({
    observedAt: z.string().datetime(),
    clarity: z
      .object({
        userId: z.string().regex(/^[a-z0-9]{1,64}$/),
        sessionId: z.string().regex(/^[a-z0-9]{1,64}$/),
      })
      .strict()
      .optional(),
    ga: z
      .object({
        clientId: z.string().regex(/^\d{1,20}\.\d{1,20}$/),
        sessionId: z.string().regex(/^\d{1,20}$/),
      })
      .strict()
      .optional(),
  })
  .strict();
export type JourneyAnalytics = z.infer<typeof journeyAnalyticsSchema>;
const base = { draftId: z.string().uuid() };
const expected = z
  .object({ userId: z.string().uuid(), workspaceId: z.string().uuid() })
  .strict();
export const journeyInputSchema = z.discriminatedUnion("op", [
  z
    .object({
      ...base,
      op: z.literal("start"),
      attachmentCount: z.number().int().min(0).max(5),
    })
    .strict(),
  z.object({ ...base, op: z.literal("bind"), expected }).strict(),
  z
    .object({ ...base, op: z.literal("retire"), expected: expected.optional() })
    .strict(),
  z
    .object({
      ...base,
      op: z.literal("events"),
      expected: expected.optional(),
      events: z.array(journeyEventSchema).max(10),
      analytics: journeyAnalyticsSchema.optional(),
    })
    .strict(),
]);
export type JourneyInput = z.infer<typeof journeyInputSchema>;
export function sanitizeJourneyEvent(
  name: FunnelEvent,
  input: FunnelParams,
): JourneyEvent | null {
  const parsed = journeyEventSchema.safeParse({
    id: crypto.randomUUID(),
    observedAt: new Date().toISOString(),
    name,
    ...(name === "funnel_step_complete" && permitsAnswer(input.funnel_id, input.step_id) && input.progression !== "skip" && typeof input.journey_answer === "string"
      ? { answer: input.journey_answer.length > 500 ? input.journey_answer.slice(0, 499).replace(/[\uD800-\uDBFF]$/, "") + "…" : input.journey_answer } : {}),
    funnel_id: input.funnel_id,
    step_id: input.step_id,
    mode: input.mode === "edit" ? "edit" : "write",
    ...(input.progression === "next" || input.progression === "skip"
      ? { progression: input.progression }
      : {}),
    ...(name === "funnel_step_error"
      ? {
          error_code: (ERRORS as readonly string[]).includes(
            input.error_code ?? "",
          )
            ? input.error_code
            : "UNKNOWN",
        }
      : {}),
  });
  return parsed.success ? parsed.data : null;
}
const labels: Record<string, string> = {
  website: "홈페이지",
  solution: "운영 솔루션",
  industry: "업종",
  products: "주요 상품",
  sellers: "입점 판매자",
  cash: "환금성 상품",
  price: "최고 가격대",
  sales: "판매 방식",
  delivery: "배송·서비스 기간",
  contract: "계약 유형",
  "current-pgs": "현재 PG사",
  payment: "결제수단",
  annual: "연간 거래액",
  fee: "현재 수수료",
  limit: "정산한도",
  insurance: "보증보험",
  cycle: "정산주기",
  title: "제목",
  memo: "메모",
  attachments: "첨부",
  landing: "랜딩",
  quote_start: "견적 작성",
  draft_complete: "작성 완료",
  choose_login: "로그인 선택",
  choose_signup: "가입 선택",
  member_return: "견적 작성 복귀",
  email: "이메일",
  company: "사업자 정보",
  profile: "프로필",
  phone: "휴대폰",
  account_created: "가입 완료",
  auto_login: "자동 로그인",
  email_verification: "이메일 인증",
  approval_pending: "심사 대기 화면",
  app_entry: "앱 진입",
  entry: "견적 작성 진입",
  business: "사업자 확인",
  questions: "견적 내용",
  recommendation: "PG 추천",
  review: "최종 요청",
  submitted: "요청 완료",
};
const kst = (date: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(date));
export function formatJourneyEvents(events: StoredJourneyEvent[]): string {
  const ordered = [...events].sort(
    (a, b) =>
      a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id),
  );
  return `행동 기록 (KST)\n${ordered
    .map((e) => {
      let action =
        e.name === "sign_up" || e.name === "quote_request_submitted"
          ? " (서버 확인)"
          : e.name === "funnel_step_error"
            ? ` 입력 오류 (${e.error_code ?? "UNKNOWN"})`
            : e.progression === "skip"
              ? " 건너뛰기"
              : e.name === "funnel_step_complete"
                ? " 입력 완료"
                : e.name === "funnel_cta_click"
                  ? e.step_id === "review"
                    ? " 시도"
                    : ""
                  : " 화면 관측";
      if (e.funnel_id === "questions" && e.name === "funnel_step_view")
        action = " 질문으로 이동";
      const answer = e.answer?.replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/[\r\n]+/g, " / ");
      return `${kst(e.observedAt)} ${labels[e.step_id] ?? e.step_id}${e.mode === "edit" ? " 수정" : ""}${action}${answer !== undefined ? `: ${answer || "미입력"}` : ""}`;
    })
    .join("\n")}`;
}
export function formatJourneyAnalytics(
  sessions: JourneyAnalytics[],
  userId: string | null,
  reportUrl?: string,
): string {
  let report = "GA 사용자 탐색: 보고서 URL 미설정";
  try {
    const url = new URL(reportUrl ?? "");
    if (
      url.origin === "https://analytics.google.com" &&
      url.href.includes("540469131") &&
      !/[<>|]/.test(url.href)
    )
      report = `GA 사용자 탐색: <${url.href}|사용자 개별 탐색>`;
  } catch {
    /* Never invent a user-specific GA URL. */
  }
  return [
    "사용자 행동 보기",
    report,
    userId ? `GA User-ID (서버 확인): ${userId}` : "GA User-ID: 로그인 전",
    ...(!sessions.length
      ? ["Clarity·GA 식별자 미확보 (SDK 차단 또는 미로딩 가능)"]
      : sessions.flatMap((s) => [
          `관측 시각: ${new Date(+new Date(s.observedAt) + 9 * 3600000).toISOString().slice(0, 10)} / ${kst(s.observedAt)} KST`,
          s.clarity
            ? `Clarity 녹화: <https://clarity.microsoft.com/player/${CLARITY_PROJECT_ID}/${s.clarity.userId}/${s.clarity.sessionId}|녹화 링크> — 재생 가능 여부는 확인하지 않았어요`
            : "Clarity 식별자 미확보",
          s.ga
            ? `GA client_id: ${s.ga.clientId} / session_id: ${s.ga.sessionId}`
            : "GA 식별자 미확보",
        ])),
  ].join("\n");
}
