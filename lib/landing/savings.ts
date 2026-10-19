/** Exact won rounding, independently from the unrounded annual numerator. */
export function calculateSavings(
  volume: string,
  reduction: string,
): { annual: number | null; monthly: number | null } {
  if (
    !/^\d+$/.test(volume) ||
    !Number.isSafeInteger(Number(volume)) ||
    !/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(reduction) ||
    Number(reduction) > 100
  ) {
    return { annual: null, monthly: null };
  }
  const [whole, fraction = ""] = reduction.split(".");
  const basisPoints =
    BigInt(whole || "0") * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  const numerator = BigInt(volume) * basisPoints;
  const rounded = (denominator: bigint) =>
    Number((numerator + denominator / BigInt(2)) / denominator);
  return { annual: rounded(BigInt(10000)), monthly: rounded(BigInt(120000)) };
}
