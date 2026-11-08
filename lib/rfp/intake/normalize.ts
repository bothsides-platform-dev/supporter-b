/** Keep the review, idempotency payload and saved new-consultation terms equal. */
export function normalizeNewRfpTerms<
  T extends { contractType?: "new" | "renewal" | null },
>(input: T): T {
  if (input.contractType !== "new") return input;
  return {
    ...input,
    monthlyAvgPgVolume: undefined,
    currentFeeRate: undefined,
    currentSettlementLimit: undefined,
    currentGuaranteeInsurance: undefined,
    currentSettlementCycle: undefined,
    currentFeeVisibleToPg: true,
    currentPgs: [],
  };
}
