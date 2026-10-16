import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/types/bid";
import { SOLUTION_VALUES } from "@/lib/types/rfp-terms";
import { productInfoSchema } from "@/lib/rfp/product-info";
import { currentPgsSchema } from "@/lib/rfp/current-pgs";

// Only answers to public questions cross this boundary. Internal workflow state
// (PG selection, deadline, submission key, calculator) is never persisted here.
export const guestAnswersSchema = z
  .object({
    title: z.string().max(200),
    websiteUrl: z.string().max(500),
    mainProducts: z.string().max(200),
    industryGroupId: z.union([z.string().uuid(), z.literal("")]),
    industryMode: z.enum(["registered", "custom"]),
    customIndustryName: z.string().max(100),
    productInfo: productInfoSchema.partial(),
    contractType: z.enum(["new", "renewal"]).nullable(),
    currentPgs: currentPgsSchema,
    requiredPaymentMethods: z
      .array(z.enum(PAYMENT_METHODS))
      .max(PAYMENT_METHODS.length),
    customPaymentMethods: z
      .array(z.object({ label: z.string().min(1).max(50) }).strict())
      .max(20),
    annualPgVolume: z.string().max(100),
    currentFeeRate: z.string().max(50),
    currentSettlementLimit: z.string().max(100),
    currentGuaranteeInsurance: z.string().max(100),
    currentSettlementCycle: z.string().max(50),
    deliveryServicePeriod: z.string().max(100),
    currentSolution: z.union([z.enum(SOLUTION_VALUES), z.literal("")]),
    currentSolutionDetail: z.string().max(100),
    currentFeeVisibleToPg: z.boolean(),
    memo: z.string().max(2000),
  })
  .partial()
  .strict();
export type GuestAnswers = z.infer<typeof guestAnswersSchema>;
export function selectGuestAnswers(
  data: Record<string, unknown>,
): GuestAnswers {
  return guestAnswersSchema.parse(
    Object.fromEntries(
      Object.keys(guestAnswersSchema.shape)
        .filter((key) => key in data)
        .map((key) => [key, data[key]]),
    ),
  );
}
export const guestFileInputSchema = z
  .object({
    clientId: z.string().uuid(),
    name: z.string().min(1).max(255),
    size: z
      .number()
      .int()
      .min(1)
      .max(20 * 1024 * 1024),
    mime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  })
  .strict();
export type GuestFileInput = z.infer<typeof guestFileInputSchema>;

export type ServerGuestDraft = {
  id: string;
  revision: number;
  answers: GuestAnswers;
  requestKey: string;
  files: { id: string; name: string; size: number }[];
  resumePending: boolean;
};
