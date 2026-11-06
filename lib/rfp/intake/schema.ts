// 견적 요청 입력 — 구매사 초안이 서버에 제출될 때 갖는 단 하나의 검증된 모양.
//
// 이 스키마가 shape 의 단일 출처다. 액션(`parse.ts`)·서비스(`ParsedCreateRfpInput`)·
// 저장 행(`to-insert.ts`)·위저드(`from-draft.ts`)는 모두 여기서 파생한 타입만 쓴다.
// 새 필드 = 이 파일 한 곳 + DB 컬럼이며, 필드 목록을 다른 파일에 손으로 복제하지 않는다.
//
// `z.input`(클라이언트·액션이 보내는 wire 모양)과 `z.output`(서비스가 받는 모양)은
// `deadline` 에서만 갈린다 — wire 는 ISO 문자열, 서비스는 Date.
//
// 서버 전용: `isValidWebsiteUrl` 이 tldts 를 끌어오므로 클라이언트 컴포넌트는 이 파일을
// 값으로 import 하지 않는다(타입 import 만 허용).
import { z } from "zod";
import { currentPgsSchema } from "@/lib/rfp/current-pgs";
import { customIndustryNameSchema } from "@/lib/rfp/industry-selection";
import { productInfoSchema } from "@/lib/rfp/product-info";
import {
  isValidWebsiteUrl,
  WEBSITE_URL_ERROR,
} from "@/lib/validation/website-url";
import { sendReadinessIssues } from "@/lib/rfp/send-readiness";
import { MERCHANT_TIERS, PAYMENT_METHODS } from "@/lib/types/bid";
import { SOLUTION_VALUES } from "@/lib/types/rfp-terms";
import { MAX_FILES } from "@/lib/server/storage/constants";
export const createRfpInputSchema = z
  .object({
    guestDraft: z
      .object({ id: z.string().uuid(), revision: z.number().int().min(1) })
      .strict()
      .optional(),
    journeyDraftId: z.string().uuid().optional(),
    industryGroupId: z.string().uuid().optional(),
    customIndustryName: customIndustryNameSchema.optional(),
    requestKey: z.string().uuid().optional(),
    title: z.string().min(1).max(200),
    memo: z.string().max(2000).optional(),
    // wire 는 ISO 문자열, 서비스 입력은 Date — 변환은 여기 한 곳.
    deadline: z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value)),
    allowedPgWorkspaceIds: z.array(z.string().uuid()).max(50),
    rfpAttachmentIds: z.array(z.string().uuid()).max(MAX_FILES).optional(),
    // 상한은 캐논니컬 개수에서 파생한다 — 손으로 적은 숫자는 결제수단이 하나
    // 늘어나는 순간 스스로 거짓이 된다. 상한은 중복 제거 *전* 배열에 걸어야
    // 의미가 있다(중복부터 접으면 어떤 입력도 상한에 닿지 못해 가드가 죽는다).
    requiredPaymentMethods: z
      .array(z.enum(PAYMENT_METHODS))
      .max(PAYMENT_METHODS.length)
      .optional()
      .default([])
      .transform((methods) => Array.from(new Set(methods))),
    customPaymentMethods: z
      .array(z.object({ label: z.string().min(1).max(50) }))
      .max(20)
      .optional()
      .default([]),
    send: z.boolean().optional().default(false),
    bizProfileMode: z
      .enum(["inherit", "override", "none"])
      .optional()
      .default("inherit"),
    bizNoOverride: z.string().min(1).max(50).optional(),
    gradeOverride: z.enum(MERCHANT_TIERS).optional(),
    websiteUrl: z
      .string()
      .max(500)
      .optional()
      .refine((v) => v === undefined || isValidWebsiteUrl(v), {
        message: WEBSITE_URL_ERROR,
      }),
    mainProducts: z.string().max(200).optional(),
    productInfo: productInfoSchema.optional(),
    monthlyAvgPgVolume: z.string().max(100).optional(),
    currentFeeRate: z.string().max(50).optional(),
    currentSettlementLimit: z.string().max(100).optional(),
    currentGuaranteeInsurance: z.string().max(100).optional(),
    currentSettlementCycle: z.string().max(50).optional(),
    deliveryServicePeriod: z.string().max(100).optional(),
    boardVisible: z.boolean().optional().default(true),
    currentFeeVisibleToPg: z.boolean().optional().default(true),
    currentSolution: z.enum(SOLUTION_VALUES).optional(),
    currentSolutionDetail: z.string().max(100).optional(),
    currentPgs: currentPgsSchema.optional(),
    contractType: z.enum(["new", "renewal"]).nullable().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    // 드래프트 저장은 비어도 허용한다. 발송 전제는 발송 가능 판정(lib/rfp/send-readiness)이
    // 위저드와 같은 규칙표로 판정한다. 단계 3(마감·PG)은 서비스가 영업일 달력과 추천 후보로
    // 다시 판정하므로 견적 내용(단계 2)만 받는다. parse.ts 가 params.rule 로 오류 코드를 고른다.
    if (!d.send) return;
    for (const issue of sendReadinessIssues(d)) {
      if (issue.step !== 2) continue;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [issue.path],
        message: issue.message,
        params: { rule: issue.rule },
      });
    }
  });

/** wire 모양 — 위저드가 보내고 액션이 받는다. `deadline` 은 ISO 문자열. */
export type CreateRfpInput = z.input<typeof createRfpInputSchema>;
/** 검증된 모양 — 서비스 `createRfp` 의 입력. `deadline` 은 Date, 기본값이 채워져 있다. */
export type ParsedCreateRfpInput = z.output<typeof createRfpInputSchema>;
