import { z } from "zod";

export const PARTNER_OUTCOME_KINDS = [
  "provider_contract_confirmed",
  "integration_verified",
  "commission_confirmed",
  "commission_paid",
  "voided",
] as const;
export type PartnerOutcomeKind = (typeof PARTNER_OUTCOME_KINDS)[number];
export const PARTNER_EVIDENCE_SOURCES = [
  "partner_confirmation",
  "operator_evidence",
  "partner_api",
  "customer_report",
  "test_result",
] as const;
export const evidenceReference = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/);
export const operatorLabel = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9@._+-]{0,159}$/);

/** Decimal strings remain exact through validation, SQL and report export. */
export const outcomeAmount = z
  .string()
  .regex(/^(0|[1-9]\d{0,15})(\.\d{1,4})?$/)
  .transform((value) => {
    const [integer, fraction = ""] = value.split(".");
    return `${integer}.${fraction.padEnd(4, "0")}`;
  });
export function amountUnits(value: string): bigint {
  const [integer, fraction = ""] = value.split(".");
  return BigInt(integer) * BigInt(10000) + BigInt(fraction.padEnd(4, "0"));
}
const common = {
  commandId: z.string().uuid(),
  requestId: z.string().uuid(),
  providerWorkspaceId: z.string().uuid(),
  reference: evidenceReference,
  evidenceReference,
  source: z.enum(PARTNER_EVIDENCE_SOURCES),
  occurredAt: z.iso.datetime({ offset: true }),
};
export const partnerOutcomeInput = z
  .discriminatedUnion("kind", [
    z
      .object({ ...common, kind: z.literal("provider_contract_confirmed") })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal("integration_verified"),
        integrationEnvironment: z.enum(["sandbox", "live"]),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal("commission_confirmed"),
        amount: outcomeAmount,
        currency: z.string().regex(/^[A-Z]{3}$/),
        agreementReference: evidenceReference,
        calculationReference: evidenceReference,
        periodStart: z.iso.date().optional(),
        periodEnd: z.iso.date().optional(),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal("commission_paid"),
        relatedEntryId: z.string().uuid(),
        amount: outcomeAmount,
        currency: z.string().regex(/^[A-Z]{3}$/),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal("voided"),
        relatedEntryId: z.string().uuid(),
        reason: z.string().trim().min(1).max(300),
      })
      .strict(),
  ])
  .superRefine((value, ctx) => {
    if (
      value.kind !== "integration_verified" &&
      ["customer_report", "test_result"].includes(value.source)
    )
      ctx.addIssue({
        code: "custom",
        path: ["source"],
        message: "confirmed partner or operator evidence required",
      });
    if (
      value.kind === "commission_paid" &&
      amountUnits(value.amount) === BigInt(0)
    )
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "payment must be positive",
      });
    if (
      value.kind === "commission_confirmed" &&
      (Boolean(value.periodStart) !== Boolean(value.periodEnd) ||
        (value.periodStart &&
          value.periodEnd &&
          value.periodStart > value.periodEnd))
    )
      ctx.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "complete ordered period required",
      });
  });
export type PartnerOutcomeInput = z.output<typeof partnerOutcomeInput>;
export type PartnerOutcomeOperator = { channel: "operator_cli"; label: string };
export class PartnerOutcomeError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "INVALID_OPERATOR"
      | "REQUEST_NOT_FOUND"
      | "REQUEST_NOT_SUBMITTED"
      | "PROVIDER_MISMATCH"
      | "AWARD_NOT_CONFIRMED"
      | "IDEMPOTENCY_CONFLICT"
      | "REFERENCE_CONFLICT"
      | "ALREADY_CONFIRMED"
      | "CONTRACT_NOT_CONFIRMED"
      | "RELATED_ENTRY_INVALID"
      | "DEPENDENT_ENTRIES_EXIST"
      | "PAYMENT_EXCEEDS_CONFIRMED"
      | "FUTURE_OCCURRENCE",
  ) {
    super(code);
  }
}
